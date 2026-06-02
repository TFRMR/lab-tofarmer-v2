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
            trading: "Jalur Sedang-Kilat", ai: "Jalur Kilat", digital: "Jalur Kilat", refleksi: "Jalur Kilat"
        };
        return jalurMap[pilar] || "Jalur Normal";
    },

    // 3. Fungsi Upsert ke Supabase (Sinkronisasi Awan)
    simpanDraft: async (userId, dataProgres) => {
        const { data, error } = await supabase
            .from('drafts')
            .upsert({
                user_id: userId,
                progres_data: dataProgres,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            });

        if (error) {
            console.error("Gagal melakukan upsert:", error.message);
        } else {
            console.log("Data berhasil di-upsert ke awan!");
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
        if (inputJudul && draft.data.judul_eksperimen) {
            inputJudul.value = draft.data.judul_eksperimen;
        }

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
    
    // 3. FUNGSI AI (Sekarang dengan Batasan 2x komentar & Debounce)
    updateAdvice: async (trigger, text) => {
    // Batasan 2x komentar tetap kita jaga
    if (Generator.komentarCount >= 2) return;

    const aiWhisperer = document.getElementById('ai-whisperer');
    const aiText = document.getElementById('ai-text');
    
    if (!aiWhisperer || !aiText) return;

    aiWhisperer.style.display = 'block';
    aiText.innerText = "Mentor sedang memeriksa rekam jejak...";

    try {
        // Panggilan ke Cloudflare Worker
        const response = await fetch('https://tofarmer-api.tofarmer-api.workers.dev/ai-saran', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                mode: "Gate1", // Tetap konsisten dengan mode humor
                trigger: trigger, 
                teks: text 
            })
        });
        
        const result = await response.json();
        const saran = result.saran || "Kebun sudah bagus, lanjut menanam!";

        // Efek ketik
        let i = 0;
        aiText.innerText = ""; 
        if (window.typingInterval) clearInterval(window.typingInterval);
        
        window.typingInterval = setInterval(() => {
            if (i < saran.length) {
                aiText.textContent += saran.charAt(i); 
                i++;
            } else {
                clearInterval(window.typingInterval);
            }
        }, 30);

        Generator.komentarCount++;
    } catch (error) {
        aiText.innerText = "Mentor lagi di sawah, nanti lagi ya.";
    }
},

    validateSensor: (judul) => {
        const isLolos = judul.length >= 20;
        const progres = Math.min((judul.length / 20) * 100, 100);
        const garis = document.getElementById('garis-progres');
        if (garis) {
            garis.style.width = progres + "%";
            garis.style.background = isLolos ? "#22c55e" : "#ef4444";
        }
        return isLolos;
    },
    
    // 4. Fungsi Pilar (Langkah 1 & 3)
    initCategorySelection: (onUpdate) => {
        const buttons = document.querySelectorAll('.category-btn');
        const inputJudul = document.querySelector('#input-judul');
        const btnLanjut = document.querySelector('.btn-lanjut');
        const microContainer = document.getElementById('micro-inputs-container');

     const validate = () => {
    const activeBtn = document.querySelector('.category-btn.active');
    
    // 1. Cek Judul (Harus >= 20 karakter)
    const isTitleValid = inputJudul.value.trim().length >= 20;
    
    // 2. Cek Micro Inputs (Harus terisi semua dan tidak boleh kosong)
    const microInputs = microContainer.querySelectorAll('.micro-input');
    const isMicroComplete = microInputs.length > 0 && 
                            Array.from(microInputs).every(i => i.value.trim().length > 0);

    // KUNCI: Gabungkan semua syarat dengan logika AND (&&)
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
                
                // RESET JATAH & Panggil AI
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

        // Event listener Judul menggunakan 'blur' (Trigger setelah selesai mengetik)
        inputJudul.addEventListener('blur', () => {
            const val = inputJudul.value.trim();
            if (val.length >= 20) {
                Generator.updateAdvice('judul', val);
            }
            validate();
            Generator.updateGate(1, { judul_eksperimen: val });
        });

        microContainer.addEventListener('input', () => {
            const inputs = microContainer.querySelectorAll('.micro-input');
            let microData = {};
            inputs.forEach(i => microData[i.id.replace('input-', '')] = i.value);
            
            const activePilar = document.querySelector('.category-btn.active')?.dataset.value;
            const kalimat = Generator.compileKalimat(activePilar, microData);
            
            Generator.updateGate(1, { 
                micro_inputs: microData, 
                kalimat_baku_compiled: kalimat,
                gate_1_status: "Lolos"
            });
            validate();
        });
    },

updateGate: async (gate, data) => {
        const userId = localStorage.getItem('tof_user_id');
        if (!userId) return;

        let state = JSON.parse(localStorage.getItem('tofarmer_draft') || '{"data":{}}');
        state.data = { ...state.data, ...data };
        localStorage.setItem('tofarmer_draft', JSON.stringify(state));
        
        // Gunakan fungsi simpanDraft baru
        await Generator.simpanDraft(userId, state.data);

        // Sinkronisasi Database Utama
        if (data.gate_1_status === "Lolos") {
            const alreadySynced = localStorage.getItem('tofarmer_synced');
            if (alreadySynced) return;
            
            try {
                const pilarMap = { ladang: 1, alat: 2, jualan: 3, konten: 4, keuangan: 5, digital: 5, refleksi: 5 };
                const pilarInt = pilarMap[state.data.pilar_bidang] || 1;

                const { error } = await supabase
                    .from('contributions')
                    .insert([{
                        user_id: userId,
                        judul_aksi: state.data.judul_eksperimen,
                        deskripsi_proses: state.data.kalimat_baku_compiled,
                        pilar_aksi: pilarInt,
                        status_validasi: 'PENDING'
                    }]);
                
                if (error) throw error;
                localStorage.setItem('tofarmer_synced', 'true');
            } catch (err) {
                console.error("Gagal sinkronisasi:", err.message);
            }
        }
    },
    renderMicroInputs: (pilar) => {
        const container = document.getElementById('micro-inputs-container');
        container.innerHTML = '';

        const templates = {
            ladang: [
                { id: 'objek', label: 'Apa yang dikerjakan?' },
                { id: 'metode', label: 'Caranya gimana?' },
                { id: 'kondisi', label: 'Situasi tempat kerjanya?' }
            ],
            alat: [
                { id: 'fungsi', label: 'Alat ini buat apa?' },
                { id: 'material', label: 'Bahannya dari apa?' },
                { id: 'mekanisme', label: 'Cara pakainya gimana?' }
            ],
            jualan: [
                { id: 'produk', label: 'Apa yang dijual?' },
                { id: 'lokasi', label: 'Mau dijual di mana?' },
                { id: 'metrik', label: 'Targetnya pengen gimana?' },
                { id: 'modal', label: 'Berapa modalnya?' }
            ],
            konten: [
                { id: 'platform', label: 'Main di platform apa?' },
                { id: 'topik', label: 'Bahasan utamanya apa?' },
                { id: 'audiens', label: 'Buat siapa kontennya?' }
            ],
            keuangan: [
                { id: 'aset', label: 'Aset yang dikelola?' },
                { id: 'strategi', label: 'Strategi kelolanya gimana?' },
                { id: 'risiko', label: 'Batasan risikonya?' }
            ],
            digital: [
                { id: 'teknologi', label: 'Teknologi yang dipakai?' },
                { id: 'kasus', label: 'Buat keperluan apa?' },
                { id: 'target', label: 'Hasil akhir yang dikejar?' }
            ],
            refleksi: [
                { id: 'tema', label: 'Tema refleksinya?' },
                { id: 'metode', label: 'Cara evaluasinya?' },
                { id: 'durasi', label: 'Berapa sering dilakuin?' }
            ]
        };

        if (templates[pilar]) {
            templates[pilar].forEach(field => {
                const div = document.createElement('div');
                div.className = 'mb-4';
                div.innerHTML = `
                    <label style="font-size: 12px; color: #9ca3af; margin-bottom: 5px;">${field.label}</label>
                    <input type="text" id="input-${field.id}" class="micro-input" placeholder="Masukkan ${field.label}..."
                           style="width: 100%; background: #111827; border: 1px solid #374151; padding: 12px; border-radius: 8px; color: white; box-sizing: border-box; outline: none;">
                `;
                container.appendChild(div);
            });
        }
    },

    compileKalimat: (pilar, data) => {
        if (pilar === 'ladang') return `Saya sedang mencoba menanam [${data.objek || '...'}] dengan cara [${data.metode || '...'}] di situasi [${data.kondisi || '...'}].`;
        if (pilar === 'alat') return `Saya sedang bikin alat untuk [${data.fungsi || '...'}] pakai bahan [${data.material || '...'}] dengan cara kerja [${data.mekanisme || '...'}].`;
        if (pilar === 'jualan') return `Saya mau coba jualan [${data.produk || '...'}] di [${data.lokasi || '...'}] dengan modal [${data.modal || '...'}] dan targetnya [${data.metrik || '...'}].`;
        if (pilar === 'konten') return `Saya bikin konten di [${data.platform || '...'}] bahas soal [${data.topik || '...'}] buat [${data.audiens || '...'}].`;
        if (pilar === 'keuangan') return `Saya kelola aset [${data.aset || '...'}] pakai strategi [${data.strategi || '...'}] dengan batasan risiko [${data.risiko || '...'}].`;
        if (pilar === 'digital') return `Saya pakai teknologi [${data.teknologi || '...'}] untuk [${data.kasus || '...'}] dengan target [${data.target || '...'}].`;
        if (pilar === 'refleksi') return `Saya refleksi soal [${data.tema || '...'}] dengan cara [${data.metode || '...'}] secara [${data.durasi || '...'}].`;
        return "";
    }
};

export { Generator };

// Jalankan ini otomatis saat halaman dibuka
document.addEventListener('DOMContentLoaded', () => {
    // 1. Muat data dari localStorage
    Generator.loadDraft();
    
    // 2. Inisialisasi Kategori (Pilar) dan berikan fungsi supaya dia tetap ter-update
    Generator.initCategorySelection((pilar) => {
        console.log("Pilar dipilih:", pilar);
    });
    
    // 3. Panggil validasi sekali di awal untuk memastikan tombol lanjut 
    // dalam keadaan terkunci/terbuka sesuai data yang baru dimuat
    // Kita panggil fungsi validate yang ada di dalam initCategorySelection 
    // Tapi karena validate ada di dalam fungsi, kita buat pemicu klik saja
    const activeBtn = document.querySelector('.category-btn.active');
    if (activeBtn) {
        // Ini memastikan validasi berjalan saat data sudah terisi
        const event = new Event('input');
        document.getElementById('micro-inputs-container').dispatchEvent(event);
    }
});