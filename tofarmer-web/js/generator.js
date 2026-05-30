const Generator = {
    saveDraft: (data) => localStorage.setItem('tofarmer_draft', JSON.stringify(data)),

    // Fungsi Validasi Sensor (Langkah 2)
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
            const isCategorySelected = document.querySelector('.category-btn.active');
            const isTitleValid = Generator.validateSensor(inputJudul.value.trim());

            if (isCategorySelected && isTitleValid) {
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
                
                // Panggil renderMicroInputs saat kategori diklik
                Generator.renderMicroInputs(btn.dataset.value);
                
                validate();
                onUpdate(btn.dataset.value);
            });
        });

        inputJudul.addEventListener('input', () => {
            validate();
            Generator.updateGate(1, { judul: inputJudul.value });
        });

        // Event listener untuk Micro-Inputs agar selalu update real-time
        microContainer.addEventListener('input', () => {
            const inputs = microContainer.querySelectorAll('.micro-input');
            let microData = {};
            inputs.forEach(i => microData[i.id.replace('input-', '')] = i.value);
            
            const activePilar = document.querySelector('.category-btn.active').dataset.value;
            const kalimat = Generator.compileKalimat(activePilar, microData);
            
            Generator.updateGate(1, { micro_inputs: microData, kalimat_baku_compiled: kalimat });
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
                { id: 'objek', label: 'Objek/Varietas' },
                { id: 'metode', label: 'Instrumen/Metode' },
                { id: 'kondisi', label: 'Kondisi Lingkungan' }
            ],
            alat: [
                { id: 'fungsi', label: 'Fungsi Utama Alat' },
                { id: 'material', label: 'Material Utama' },
                { id: 'mekanisme', label: 'Mekanisme Kerja' }
            ],
            jualan: [
                { id: 'produk', label: 'Produk/Jasa Target' },
                { id: 'lokasi', label: 'Lokasi/Target Konsumen' },
                { id: 'metrik', label: 'Metrik Validasi Utama' },
                { id: 'modal', label: 'Batasan Modal' }
            ],
            konten: [
                { id: 'platform', label: 'Platform Target' },
                { id: 'topik', label: 'Topik Utama' },
                { id: 'audiens', label: 'Target Audiens' }
            ],
            keuangan: [
                { id: 'aset', label: 'Aset/Instrumen' },
                { id: 'strategi', label: 'Strategi Kelola' },
                { id: 'risiko', label: 'Batasan Risiko' }
            ],
            digital: [
                { id: 'teknologi', label: 'Stack/Teknologi' },
                { id: 'kasus', label: 'Kasus Penggunaan' },
                { id: 'target', label: 'Hasil/Target Output' }
            ],
            refleksi: [
                { id: 'tema', label: 'Tema Refleksi' },
                { id: 'metode', label: 'Metode Evaluasi' },
                { id: 'durasi', label: 'Durasi/Frekuensi' }
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
            return `Eksperimen dilakukan pada [${data.kondisi || '...'}] menggunakan instrumen/alat [${data.metode || '...'}] dengan objek target [${data.objek || '...'}].`;
        } else if (pilar === 'alat') {
            return `Eksperimen pembuatan alat dilakukan untuk fungsi [${data.fungsi || '...'}] menggunakan material utama [${data.material || '...'}] dengan mekanisme kerja [${data.mekanisme || '...'}].`;
        } else if (pilar === 'jualan') {
            return `Eksperimen niaga dilakukan pada objek [${data.produk || '...'}] yang diuji di [${data.lokasi || '...'}] di bawah batasan [${data.modal || '...'}] dengan target keberhasilan [${data.metrik || '...'}].`;
        } else if (pilar === 'konten') {
            return `Eksperimen konten dilakukan pada platform [${data.platform || '...'}] dengan topik [${data.topik || '...'}] yang ditujukan untuk audiens [${data.audiens || '...'}].`;
        } else if (pilar === 'keuangan') {
            return `Eksperimen keuangan dilakukan pada aset/instrumen [${data.aset || '...'}] menggunakan strategi [${data.strategi || '...'}] dengan batasan risiko [${data.risiko || '...'}].`;
        } else if (pilar === 'digital') {
            return `Eksperimen digital dilakukan menggunakan teknologi [${data.teknologi || '...'}] untuk kasus penggunaan [${data.kasus || '...'}] dengan target hasil [${data.target || '...'}].`;
        } else if (pilar === 'refleksi') {
            return `Eksperimen refleksi dilakukan dengan tema [${data.tema || '...'}] menggunakan metode evaluasi [${data.metode || '...'}] dalam durasi/frekuensi [${data.durasi || '...'}].`;
        }
        return "";
    }
};

export { Generator };