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
        // Nanti kita isi logika form dinamis per pilar di sini
        console.log("Rendering form untuk pilar:", pilar);
    }
};

export { Generator };