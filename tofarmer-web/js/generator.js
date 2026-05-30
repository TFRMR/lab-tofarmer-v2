// Ganti seluruh isi file generator.js dengan ini:
const Generator = {
    saveDraft: (data) => localStorage.setItem('tofarmer_draft', JSON.stringify(data)),
    
    initCategorySelection: (onUpdate) => {
        const buttons = document.querySelectorAll('.category-btn');
        const inputJudul = document.querySelector('#input-judul');
        const btnLanjut = document.querySelector('.btn-lanjut');

        const validate = () => {
            const isCategorySelected = document.querySelector('.category-btn.border-green-500');
            const isTitleValid = inputJudul.value.trim().length >= 5;

            if (isCategorySelected && isTitleValid) {
                btnLanjut.classList.remove('cursor-not-allowed', 'text-gray-500', 'bg-gray-800');
                btnLanjut.classList.add('bg-green-600', 'text-white', 'cursor-pointer', 'hover:bg-green-700');
            } else {
                btnLanjut.classList.add('cursor-not-allowed', 'text-gray-500', 'bg-gray-800');
                btnLanjut.classList.remove('bg-green-600', 'text-white', 'cursor-pointer', 'hover:bg-green-700');
            }
        };

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('border-green-500', 'bg-gray-700'));
                btn.classList.add('border-green-500', 'bg-gray-700');
                validate();
                onUpdate(btn.dataset.value);
            });
        });
        inputJudul.addEventListener('input', validate);
    },

    updateGate: (gate, data) => {
        let state = JSON.parse(localStorage.getItem('tofarmer_draft') || '{"data":{}}');
        state.data = { ...state.data, ...data };
        localStorage.setItem('tofarmer_draft', JSON.stringify(state));
    }
};
export { Generator };