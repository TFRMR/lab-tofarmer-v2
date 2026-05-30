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
    }
};

export { Generator };