// tofarmer-web/js/generator.js

const Generator = {
    // 1. Memori Kantong (LocalStorage)
    saveDraft: (data) => {
        localStorage.setItem('tofarmer_draft', JSON.stringify(data));
    },

    loadDraft: () => {
        const draft = localStorage.getItem('tofarmer_draft');
        return draft ? JSON.parse(draft) : {
            gate: 1,
            data: {}
        };
    },

    // 2. Logika Update State
    updateGate: (currentGate, newData) => {
        let state = Generator.loadDraft();
        state.gate = currentGate;
        state.data = { ...state.data, ...newData };
        Generator.saveDraft(state);
        console.log(`Gate ${currentGate} tersimpan:`, state);
    },

    // 3. UI Handler yang sudah disinkronkan
    initCategorySelection: (callback) => {
        const buttons = document.querySelectorAll('.category-btn');
        const btnLanjut = document.querySelector('.btn-lanjut');

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Hapus style aktif dari semua tombol kategori
                buttons.forEach(b => b.classList.remove('border-green-500', 'bg-gray-700'));
                // Tambahkan style aktif ke tombol yang diklik
                btn.classList.add('border-green-500', 'bg-gray-700');

                // AKTIFKAN TOMBOL LANJUT
                if (btnLanjut) {
                    btnLanjut.classList.remove('cursor-not-allowed', 'text-gray-500', 'bg-gray-800');
                    btnLanjut.classList.add('bg-green-600', 'text-white', 'cursor-pointer', 'hover:bg-green-700');
                }
                
                callback(btn.dataset.value);
            });
        });
    }
};

// Gunakan export { Generator } agar bisa di-import dengan kurung kurawal
export { Generator };