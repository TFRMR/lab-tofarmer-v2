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

    // Tombol kecil minimalis & tipis
    const btnTranslate = document.createElement('button');
    btnTranslate.id = "tof-translator-trigger";
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
    btnTranslate.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    btnTranslate.style.backdropFilter = 'blur(4px)';
    btnTranslate.style.cursor = 'pointer';
    btnTranslate.style.boxShadow = '0px 2px 8px rgba(0,0,0,0.05)';
    btnTranslate.style.transition = 'all 0.2s ease';
    document.body.appendChild(btnTranslate);

    btnTranslate.onmouseover = () => { btnTranslate.style.backgroundColor = '#fff'; btnTranslate.style.color = '#2f6f4e'; };
    btnTranslate.onmouseout = () => { btnTranslate.style.backgroundColor = 'rgba(255, 255, 255, 0.9)'; btnTranslate.style.color = '#666'; };

    let intervalPenerjemah = null;

    // Fungsi translasi berbasis text node (Aman dari merusak onclick tombol)
    function saringDanTerjemahkan(node) {
        if (!node) return;
        if (node.id === "tof-translator-trigger") return;

        if (node.nodeType === Node.TEXT_NODE) {
            let teksAsli = node.nodeValue.trim();
            for (const [kunci, nilai] of Object.entries(kamusToFarmer)) {
                if (teksAsli === kunci || (teksAsli.includes(kunci) && !teksAsli.includes(nilai))) {
                    node.nodeValue = node.nodeValue.replace(kunci, nilai);
                }
            }
        } else {
            if (node.tagName === 'INPUT' && node.placeholder && kamusToFarmer[node.placeholder]) {
                node.placeholder = kamusToFarmer[node.placeholder];
            }
            for (let i = 0; i < node.childNodes.length; i++) {
                saringDanTerjemahkan(node.childNodes[i]);
            }
        }
    }

    // Interval santai setiap 2 detik untuk memeriksa postingan baru (Supabase data)
    function mulaiSistemLoop() {
        if (intervalPenerjemah) clearInterval(intervalPenerjemah);
        saringDanTerjemahkan(document.body); // Jalankan instan sekali
        intervalPenerjemah = setInterval(() => {
            saringDanTerjemahkan(document.body);
        }, 2000); 
    }

    let statusBahasa = localStorage.getItem('tof_bahasa_pilihan') || 'id';

    if (statusBahasa === 'en') {
        btnTranslate.innerHTML = '🌐 ID';
        // Beri jeda 1.5 detik di awal agar loading Supabase selesai dulu
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
            if (intervalPenerjemah) clearInterval(intervalPenerjemah);
            window.location.reload(); 
        }
    });
})();