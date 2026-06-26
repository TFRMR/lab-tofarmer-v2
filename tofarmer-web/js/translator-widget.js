// /tofarmer-web/public/js/translator-widget.js
(function() {
    const kamusToFarmer = {
        "🔑 MASUK / DAFTAR 🌿": "🔑 LOGIN / REGISTER 🌿",
        "🚪 LOGOUT": "🚪 LOGOUT",
        "👤 Masuk Profil": "👤 View Profile",
        "☕ Lihat Profil": "☕ View Profile",
        "Total-": "Total Farmers: ",
        "Sync...": "Syncing...",
        "Mau ditanam di ladang mana?": "Which field do you want to plant this in?",
        "Pilih dulu temamu 😎": "Choose your theme first 😎",
        "🤝 Titik Kumpul": "🤝 Gathering Point",
        "Ngopi, ide, ngobrol, santai ,ngonten": "Coffee, ideas, chat, relax, content",
        "🤖 Ladang Eksperimen": "🤖 Experiment Field",
        "AI, blockchain, robot, dan ide yang kadang \u201cnggak masuk akal\u201d": "AI, blockchain, robotics, and out-of-the-box ideas",
        "🌱 Cerita Tanah & Panen": "🌱 Soil & Harvest Stories",
        "Drama masuk kebun": "Garden diaries and dramas",
        "☕ Duit...duit dan duit": "☕ Money, money, and money",
        "TOF, aset, strategi biar ladang tetap jalan": "TOF tokens, assets, and sustainability strategies",
        "🔥 Mode Petapa Gunung": "🔥 Mountain Hermit Mode",
        "Renungan, kabut pagi, dan pikiran random": "Reflections, morning mist, and random thoughts",
        "🐐 batal, kambing panen dulu": "🐐 Cancel, let the goats harvest first",
        "Sruput": "Sips",
        "Cangkul": "Digs",
        "📢 Bagikan Progres": "📢 Share Progress",
        "Komentar": "Comments",
        "Tulis komentar ladang...": "Write a field comment...",
        "Kirim": "Send",
        "Belum ada diskusi, yuk sapa petani! 🌱": "No discussions yet, come say hi to the farmer! 🌱",
        "✏️ Edit Postingan": "✏️ Edit Post",
        "🔒 Sembunyikan ke Profil": "🔒 Hide to Profile",
        "🌾 Semua postingan sudah dimuat": "🌾 All posts have been loaded",
        "⏳ Memuat lebih banyak...": "⏳ Loading more...",
        "👑 Mahaguru ladang": "👑 Field Grandmaster",
        "🧙‍♂️ Sesepuh Kebun": "🧙‍♂️ Garden Elder",
        "👨‍🌾 Penguasa Lahan": "👨‍🌾 Land Ruler",
        "🌱 Petani Teladan": "🌱 Model Farmer",
        "🌿 Pembasmi Gulma": "🌿 Weed Eradicator",
        "🍃 Penyiram Ulung": "🍃 Master Waterer",
        "🪵 Buruh Macul": "🪵 Hoeing Laborer",
        "⚠️ Gagal memuat peringkat": "⚠️ Failed to load leaderboard"
    };

    // Elemen interaktif yang TIDAK boleh disentuh child node-nya
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'NOSCRIPT', 'TEXTAREA']);

    // Terjemahkan hanya TEXT NODE langsung, tidak traverse ke dalam elemen interaktif
    function terjemahkanNode(node) {
        if (!node) return;

        // Skip elemen translator itu sendiri
        if (node.nodeType === Node.ELEMENT_NODE && node.id === "tof-translator-trigger") return;

        if (node.nodeType === Node.TEXT_NODE) {
            // Hanya proses jika ada teks nyata
            if (!node.nodeValue || !node.nodeValue.trim()) return;

            for (const [kunci, nilai] of Object.entries(kamusToFarmer)) {
                if (node.nodeValue.includes(kunci) && !node.nodeValue.includes(nilai)) {
                    node.nodeValue = node.nodeValue.replace(kunci, nilai);
                }
            }

        } else if (node.nodeType === Node.ELEMENT_NODE) {
            // Skip tag yang tidak boleh disentuh
            if (SKIP_TAGS.has(node.tagName)) return;

            // Terjemahkan placeholder input tanpa menyentuh event listener
            if ((node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') && node.placeholder) {
                for (const [kunci, nilai] of Object.entries(kamusToFarmer)) {
                    if (node.placeholder.includes(kunci) && !node.placeholder.includes(nilai)) {
                        node.placeholder = node.placeholder.replace(kunci, nilai);
                    }
                }
            }

            // Traverse hanya TEXT NODE children langsung — tidak rekursif masuk ke elemen interaktif
            for (let i = 0; i < node.childNodes.length; i++) {
                terjemahkanNode(node.childNodes[i]);
            }
        }
    }

    // Tombol kecil minimalis & tipis
    const btnTranslate = document.createElement('button');
    btnTranslate.id = "tof-translator-trigger";
    btnTranslate.style.cssText = `
        position: fixed;
        bottom: 15px;
        right: 15px;
        z-index: 999999;
        padding: 6px 12px;
        border-radius: 6px;
        border: 1px solid #ddd;
        font-size: 11px;
        font-family: sans-serif;
        color: #666;
        background-color: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(4px);
        cursor: pointer;
        box-shadow: 0px 2px 8px rgba(0,0,0,0.05);
        transition: all 0.2s ease;
    `;
    document.body.appendChild(btnTranslate);

    btnTranslate.onmouseover = () => {
        btnTranslate.style.backgroundColor = '#fff';
        btnTranslate.style.color = '#2f6f4e';
    };
    btnTranslate.onmouseout = () => {
        btnTranslate.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        btnTranslate.style.color = '#666';
    };

    let observer = null;

    function mulaiSistemLoop() {
        // Terjemahkan seluruh halaman sekali di awal
        terjemahkanNode(document.body);

        // Hentikan observer lama kalau masih jalan
        if (observer) observer.disconnect();

        observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                // Hanya proses node yang BARU ditambahkan ke DOM
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.id === "tof-translator-trigger") continue;
                    terjemahkanNode(node);
                }
            }
        });

        observer.observe(document.body, {
            childList: true,       // pantau elemen baru
            subtree: true,         // termasuk nested
            characterData: false,  // JANGAN pantau perubahan teks (mencegah loop)
            attributes: false      // JANGAN pantau perubahan atribut
        });
    }

    function hentikanSistemLoop() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }

    let statusBahasa = localStorage.getItem('tof_bahasa_pilihan') || 'id';

    if (statusBahasa === 'en') {
        btnTranslate.innerHTML = '🌐 ID';
        // Beri jeda 1.5 detik agar konten Supabase selesai dimuat dulu
        setTimeout(mulaiSistemLoop, 1500);
    } else {
        btnTranslate.innerHTML = '🌐 EN';
    }

    btnTranslate.addEventListener('click', function() {
        if (statusBahasa === 'id') {
            localStorage.setItem('tof_bahasa_pilihan', 'en');
            btnTranslate.innerHTML = '🌐 ID';
            statusBahasa = 'en';
            mulaiSistemLoop();
        } else {
            localStorage.setItem('tof_bahasa_pilihan', 'id');
            hentikanSistemLoop();
            window.location.reload();
        }
    });

})();