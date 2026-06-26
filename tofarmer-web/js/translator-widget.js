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
        "AI, blockchain, robot, dan ide yang kadang “nggak masuk akal”": "AI, blockchain, robotics, and out-of-the-box ideas",
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

    // Tombol kecil minimalis
    const btnTranslate = document.createElement('button');
    btnTranslate.id = "tof-translator-trigger"; // Beri ID khusus agar tidak ikut terproses
    btnTranslate.style.position = 'fixed';
    btnTranslate.style.bottom = '15px';
    btnTranslate.style.right = '15px';
    btnTranslate.style.zIndex = '999999';
    btnTranslate.style.padding = '6px 12px';
    btnTranslate.style.borderRadius = '6px';
    btnTranslate.style.border = '1px solid #ddd';
    btnTranslate.style.fontSize = '11px';
    btnTranslate.style.fontFamily = 'sans-serif';
    btnTranslate.style.color = '#666';
    btnTranslate.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
    btnTranslate.style.backdropFilter = 'blur(4px)';
    btnTranslate.style.cursor = 'pointer';
    btnTranslate.style.boxShadow = '0px 2px 8px rgba(0,0,0,0.05)';
    btnTranslate.style.transition = 'all 0.2s ease';
    document.body.appendChild(btnTranslate);

    btnTranslate.onmouseover = () => { btnTranslate.style.backgroundColor = '#fff'; btnTranslate.style.color = '#2f6f4e'; };
    btnTranslate.onmouseout = () => { btnTranslate.style.backgroundColor = 'rgba(255, 255, 255, 0.85)'; btnTranslate.style.color = '#666'; };

    let pengintaiHalaman = null;

    // Fungsi translasi super aman yang tidak merusak fungsi tombol (event listener)
    function terjemahkanAman(node) {
        if (node.id === "tof-translator-trigger") return;

        // Jika tipe node adalah TEXT (Bukan elemen HTML penuh)
        if (node.nodeType === Node.TEXT_NODE) {
            let teksAsli = node.nodeValue.trim();
            for (const [kunci, nilai] of Object.entries(kamusToFarmer)) {
                if (teksAsli.includes(kunci)) {
                    node.nodeValue = node.nodeValue.replace(kunci, nilai);
                }
            }
        } else {
            // Cek placeholder input
            if (node.tagName === 'INPUT' && node.placeholder && kamusToFarmer[node.placeholder]) {
                node.placeholder = kamusToFarmer[node.placeholder];
            }
            // Sisir semua anak cucu text node di dalamnya secara rekursif
            for (let i = 0; i < node.childNodes.length; i++) {
                terjemahkanAman(node.childNodes[i]);
            }
        }
    }

    function mulaiMengintaiPostingan() {
        if (pengintaiHalaman) return;
        pengintaiHalaman = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    terjemahkanAman(node);
                });
            });
        });
        pengintaiHalaman.observe(document.body, { childList: true, subtree: true });
    }

    function hentikanPengintai() {
        if (pengintaiHalaman) {
            pengintaiHalaman.disconnect();
            pengintaiHalaman = null;
        }
    }

    let statusBahasa = localStorage.getItem('tof_bahasa_pilihan') || 'id';

    if (statusBahasa === 'en') {
        setTimeout(() => {
            terjemahkanAman(document.body);
            mulaiMengintaiPostingan();
        }, 1200); 
        btnTranslate.innerHTML = '🌐 ID';
    } else {
        btnTranslate.innerHTML = '🌐 EN';
    }

    btnTranslate.addEventListener('click', function() {
        if (statusBahasa === 'id') {
            localStorage.setItem('tof_bahasa_pilihan', 'en');
            terjemahkanAman(document.body);
            mulaiMengintaiPostingan();
            btnTranslate.innerHTML = '🌐 ID';
            statusBahasa = 'en';
        } else {
            localStorage.setItem('tof_bahasa_pilihan', 'id');
            hentikanPengintai();
            window.location.reload(); 
        }
    });
})();