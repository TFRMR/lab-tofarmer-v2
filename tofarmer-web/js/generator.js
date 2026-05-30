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