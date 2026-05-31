import { bimbingan } from './ai-logic.js';

const Generator = {
    // 1. Pemetaan Jalur (Sesuai Dokumen)
    getJalur: (pilar) => {
        const jalurMap = {
            ladang: "Jalur Lambat", alat: "Jalur Lambat",
            jualan: "Jalur Sedang", komunitas: "Jalur Sedang",
            trading: "Jalur Sedang-Kilat", ai: "Jalur Kilat", digital: "Jalur Kilat", refleksi: "Jalur Kilat"
        };
        return jalurMap[pilar] || "Jalur Normal";
    },

    saveDraft: (data) => localStorage.setItem('tofarmer_draft', JSON.stringify(data)),
    // FUNGSI AI PALSU (Diperbaiki agar mengambil data dari ai-logic.js)
    // FUNGSI AI PALSU (Diperbaiki agar mengambil data dari ai-logic.js)
    updateAdvice: () => {
        const aiWhisperer = document.getElementById('ai-whisperer');
        const aiText = document.getElementById('ai-text');
        const inputJudul = document.getElementById('input-judul');
        const activeBtn = document.querySelector('.category-btn.active');
        
        if (aiWhisperer && aiText && inputJudul) {
            const pilar = activeBtn ? activeBtn.dataset.value : null;
            const judul = inputJudul.value.trim();
            
            aiWhisperer.style.display = 'block';
            aiWhisperer.classList.add('ai-active'); // Menambahkan animasi berdenyut
            
            const pilarData = bimbingan[pilar] || { pendek: "Pilih bidang eksperimenmu untuk memulai.", lengkap: "" };
            const saran = (judul.length < 20) ? pilarData.pendek : pilarData.lengkap;
            
            // Menampilkan saran dengan efek mengetik
            let i = 0;
            aiText.innerText = ""; // Mengosongkan teks awal
            
            if (window.typingInterval) clearInterval(window.typingInterval);
            
            window.typingInterval = setInterval(() => {
                if (i < saran.length) {
                    aiText.innerText += saran.charAt(i); // Mengambil karakter dari variabel saran
                    i++;
                } else {
                    clearInterval(window.typingInterval);
                }
            }, 30);
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
    // Fungsi Pilar (Langkah 1 & 3)
    initCategorySelection: (onUpdate) => {
        const buttons = document.querySelectorAll('.category-btn');
        const inputJudul = document.querySelector('#input-judul');
        const btnLanjut = document.querySelector('.btn-lanjut');
        const microContainer = document.getElementById('micro-inputs-container');

       const validate = () => {
            const activeBtn = document.querySelector('.category-btn.active');
            const isTitleValid = Generator.validateSensor(inputJudul.value.trim());
            
            // LOGIKA DIPERBAIKI DI SINI:
            const microInputs = microContainer.querySelectorAll('.micro-input');
            // Cek apakah ada input, dan pastikan SEMUA input tidak kosong
            const isMicroComplete = microInputs.length > 0 && Array.from(microInputs).every(i => i.value.trim() !== "");

            if (activeBtn && isTitleValid && isMicroComplete) {
                btnLanjut.classList.add('active');
                btnLanjut.innerText = "🔓 KUNCI FONDASI & MAJU KE GATE 2";
            } else {
                btnLanjut.classList.remove('active');
                btnLanjut.innerText = "🔒 GERBANG TERKUNCI";
            }
            Generator.updateAdvice();
        };

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Panggil renderMicroInputs saat kategori diklik
                Generator.renderMicroInputs(btn.dataset.value);
                
                // Simpan karakteristik jalur saat pilar dipilih
                Generator.updateGate(1, { 
                    pilar_bidang: btn.dataset.value, 
                    karakteristik_jalur: Generator.getJalur(btn.dataset.value) 
                });
                
                validate();
                onUpdate(btn.dataset.value);
            });
        });

        inputJudul.addEventListener('input', () => {
            validate();
            Generator.updateGate(1, { judul_eksperimen: inputJudul.value });
            updateAdvice(); // Tambahan untuk memicu pembaruan AI Palsu
        });

        // Event listener untuk Micro-Inputs agar selalu update real-time
        microContainer.addEventListener('input', () => {
            const inputs = microContainer.querySelectorAll('.micro-input');
            let microData = {};
            inputs.forEach(i => microData[i.id.replace('input-', '')] = i.value);
            
            const activePilar = document.querySelector('.category-btn.active').dataset.value;
            const kalimat = Generator.compileKalimat(activePilar, microData);
            
            Generator.updateGate(1, { 
                micro_inputs: microData, 
                kalimat_baku_compiled: kalimat,
                gate_1_status: "Lolos"
            });
            validate();
            updateAdvice(); // Tambahan untuk memicu pembaruan AI Palsu
        });
    },

    updateGate: (gate, data) => {
        let state = JSON.parse(localStorage.getItem('tofarmer_draft') || '{"data":{}}');
        state.data = { ...state.data, ...data };
        localStorage.setItem('tofarmer_draft', JSON.stringify(state));
    },

    renderMicroInputs: (pilar) => {
        const container = document.getElementById('micro-inputs-container');
        container.innerHTML = ''; // Bersihkan kontainer

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
        if (pilar === 'ladang') {
            return `Saya sedang mencoba menanam [${data.objek || '...'}] dengan cara [${data.metode || '...'}] di situasi [${data.kondisi || '...'}].`;
        } else if (pilar === 'alat') {
            return `Saya sedang bikin alat untuk [${data.fungsi || '...'}] pakai bahan [${data.material || '...'}] dengan cara kerja [${data.mekanisme || '...'}].`;
        } else if (pilar === 'jualan') {
            return `Saya mau coba jualan [${data.produk || '...'}] di [${data.lokasi || '...'}] dengan modal [${data.modal || '...'}] dan targetnya [${data.metrik || '...'}].`;
        } else if (pilar === 'konten') {
            return `Saya bikin konten di [${data.platform || '...'}] bahas soal [${data.topik || '...'}] buat [${data.audiens || '...'}].`;
        } else if (pilar === 'keuangan') {
            return `Saya kelola aset [${data.aset || '...'}] pakai strategi [${data.strategi || '...'}] dengan batasan risiko [${data.risiko || '...'}].`;
        } else if (pilar === 'digital') {
            return `Saya pakai teknologi [${data.teknologi || '...'}] untuk [${data.kasus || '...'}] dengan target [${data.target || '...'}].`;
        } else if (pilar === 'refleksi') {
            return `Saya refleksi soal [${data.tema || '...'}] dengan cara [${data.metode || '...'}] secara [${data.durasi || '...'}].`;
        }
        return "";
    }
};

export { Generator };