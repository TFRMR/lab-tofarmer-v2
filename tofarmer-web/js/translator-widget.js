// /tofarmer-web/public/js/translator-widget.js
(function() {
    // 1. KAMUS ISTILAH KHAS TOFARMER (Disesuaikan dengan kode UI medsosmu)
    const kamusToFarmer = {
        // UI Registrasi & Tombol Atas
        "🔑 MASUK / DAFTAR 🌿": "🔑 LOGIN / REGISTER 🌿",
        "🚪 LOGOUT": "🚪 LOGOUT",
        "👤 Masuk Profil": "👤 View Profile",
        "☕ Lihat Profil": "☕ View Profile",
        "Total-": "Total Farmers: ",
        "Sync...": "Syncing...",
        
        // Pilar Kebun / Popup Pilar
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

        // Komponen Feed Postingan
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
        
        // Radar Peringkat Card
        "👑 Mahaguru ladang": "👑 Field Grandmaster",
        "🧙‍♂️ Sesepuh Kebun": "🧙‍♂️ Garden Elder",
        "👨‍🌾 Penguasa Lahan": "👨‍🌾 Land Ruler",
        "🌱 Petani Teladan": "🌱 Model Farmer",
        "🌿 Pembasmi Gulma": "🌿 Weed Eradicator",
        "🍃 Penyiram Ulung": "🍃 Master Waterer",
        "🪵 Buruh Macul": "🪵 Hoeing Laborer",
        "⚠️ Gagal memuat peringkat": "⚠️ Failed to load leaderboard"
    };

    // 2. Membuat Tombol Floating Estetik Berwarna Hijau ToFarmer
    const btnTranslate = document.createElement('button');
    btnTranslate.innerHTML = '🌐 Translate to EN';
    btnTranslate.style.position = 'fixed';
    btnTranslate.style.bottom = '25px';
    btnTranslate.style.right = '25px';
    btnTranslate.style.zIndex = '999999'; // Menimpa semua modal popup
    btnTranslate.style.padding = '12px 20px';
    btnTranslate.style.borderRadius = '30px';
    btnTranslate.style.border = '2px solid #2f6f4e'; // Warna batas hijau tua ToFarmer
    btnTranslate.style.backgroundColor = '#4caf7a'; // Warna gradien hijau daun
    btnTranslate.style.color = 'white';
    btnTranslate.style.cursor = 'pointer';
    btnTranslate.style.fontWeight = 'bold';
    btnTranslate.style.boxShadow = '0px 10px 30px rgba(47, 111, 78, 0.3)';
    btnTranslate.style.transition = 'all 0.3s ease';
    
    document.body.appendChild(btnTranslate);

    let isEnglish = false;

    // 3. Mesin Penerjemah DOM Tanpa Merusak State Ekosistem
    function jalankanTranslasi() {
        if (!isEnglish) {
            // Targetkan semua node teks potensial di dalam web medsos
            const elemenTeks = document.querySelectorAll('p, h1, h2, h3, button, span, a, div, small');
            
            elemenTeks.forEach(el => {
                // Skip jika elemen memiliki child berupa element lain (agar HTML tidak rusak)
                if (el.children.length > 0 && el.tagName !== 'BUTTON') return;

                let teksAsli = el.innerText ? el.innerText.trim() : "";
                
                // Cari kecocokan parsial atau penuh dalam kamus adat ToFarmer
                for (const [kunci, nilai] of Object.entries(kamusToFarmer)) {
                    if (teksAsli.includes(kunci)) {
                        el.innerText = teksAsli.replace(kunci, nilai);
                    }
                }

                // Terjemahkan placeholder pada kotak input secara instan
                if (el.tagName === 'INPUT' && el.placeholder) {
                    if (kamusToFarmer[el.placeholder]) {
                        el.placeholder = kamusToFarmer[el.placeholder];
                    }
                }
            });

            btnTranslate.innerHTML = '🔄 Ke Bahasa ID';
            btnTranslate.style.backgroundColor = '#c9a227'; // Berubah ke aksen warna TOF emas
            btnTranslate.style.border = '2px solid #b5942b';
            isEnglish = true;
        } else {
            // Amankan data real-time dengan reload halaman untuk kembali ke setelan lokal Indonesia
            window.location.reload(); 
        }
    }

    // Registrasi Event Klik Tombol
    btnTranslate.addEventListener('click', jalankanTranslasi);
})();