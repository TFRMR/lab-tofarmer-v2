// /tofarmer-web/public/js/translator-widget.js
(function () {
    // ─── 1. KAMUS UI STATIS (Instan tanpa API) ──────────────────────────────────
    const kamusUI = {
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

    const cacheTerjemahan = {};
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'NOSCRIPT']);
    let statusBahasa = localStorage.getItem('tof_bahasa_pilihan') || 'id';
    let intervalUI = null;

    // ─── 2. SELEKTOR TERJEMAH UI AMAN ─────────────────────────────────────────
    function terjemahUINode(node) {
        if (!node) return;
        if (node.nodeType === Node.ELEMENT_NODE && node.id === "tof-translator-trigger") return;

        if (node.nodeType === Node.TEXT_NODE) {
            let teksAsli = node.nodeValue.trim();
            if (!teksAsli) return;
            for (const [kunci, nilai] of Object.entries(kamusUI)) {
                if (teksAsli === kunci || (teksAsli.includes(kunci) && !teksAsli.includes(nilai))) {
                    node.nodeValue = node.nodeValue.replace(kunci, nilai);
                }
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (SKIP_TAGS.has(node.tagName)) return;
            if ((node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') && node.placeholder) {
                if (kamusUI[node.placeholder]) node.placeholder = kamusUI[node.placeholder];
            }
            for (let i = 0; i < node.childNodes.length; i++) {
                terjemahUINode(node.childNodes[i]);
            }
        }
    }

    // ─── 3. ENGINE FETCH MYMEMORY (DENGAN EMAIL BIAR KUOTA LUAS) ───────────────
    async function panggilAPIKueri(teks) {
        const bersih = teks.trim();
        if (!bersih || bersih.length < 2) return teks;
        if (cacheTerjemahan[bersih]) return cacheTerjemahan[bersih];

        try {
            // Menggunakan email anonim bawaan publik untuk membuka kuota gratis hingga 30.000 kata/hari
            const res = await fetch(
                `https://api.mymemory.translated.net/get?q=${encodeURIComponent(bersih)}&langpair=id|en&de=tofarmer_xyz@gmail.com`
            );
            const data = await res.json();
            if (data.responseStatus === 200 && data.responseData?.translatedText) {
                cacheTerjemahan[bersih] = data.responseData.translatedText;
                return cacheTerjemahan[bersih];
            }
        } catch (e) {
            console.warn('[TOF] API error:', e);
        }
        return teks;
    }

    // ─── 4. SUNTIK TOMBOL TRANSLATE TIPIS DI BAWAH POSTINGAN/KOMENTAR ──────────
    function pasangTombolPerPostingan() {
        if (statusBahasa !== 'en') return;

        // Cari div teks postingan (.text) dan teks komentar (span pre-wrap) yang belum dipasangi tombol
        const targetPost = document.querySelectorAll('.text:not([data-tof-btn]), span[style*="white-space:pre-wrap"]:not([data-tof-btn])');

        targetPost.forEach(el => {
            el.setAttribute('data-tof-btn', '1'); 
            const teksAsli = el.innerText?.trim();
            if (!teksAsli || teksAsli.length < 5 || Object.values(kamusUI).includes(teksAsli)) return;

            // Buat element tautan klik super tipis ala Facebook
            const btnLink = document.createElement('small');
            btnLink.innerText = ' See Translation';
            btnLink.style.cssText = 'color: #888; cursor: pointer; font-size: 10px; margin-left: 8px; text-decoration: underline; display: inline-block;';
            
            btnLink.addEventListener('click', async function(e) {
                e.stopPropagation();
                if (btnLink.innerText === ' See Translation') {
                    btnLink.innerText = ' Translating...';
                    el.style.opacity = '0.5';
                    const hasil = await panggilAPIKueri(teksAsli);
                    el.style.opacity = '1';
                    
                    // Ganti teks terdalam tanpa merusak elemen HTML luar
                    if (el.childNodes.length > 0 && el.childNodes[0].nodeType === Node.TEXT_NODE) {
                        el.childNodes[0].nodeValue = hasil + " ";
                    } else {
                        el.textContent = hasil + " ";
                        el.appendChild(btnLink); // pasang ulang tombolnya di dalam
                    }
                    btnLink.innerText = ' Show Original';
                } else {
                    // Balik ke teks asal
                    if (el.childNodes.length > 0 && el.childNodes[0].nodeType === Node.TEXT_NODE) {
                        el.childNodes[0].nodeValue = teksAsli + " ";
                    } else {
                        el.textContent = teksAsli + " ";
                        el.appendChild(btnLink);
                    }
                    btnLink.innerText = ' See Translation';
                }
            });

            // Selipkan tombol tepat di dalam ujung element teks profil/post
            el.appendChild(btnLink);
        });
    }

    // ─── 5. LOOP MONITORING RINGAN (ANTI-STUCK) ──────────────────────────────
    function jalankanSistemPenerjemah() {
        terjemahUINode(document.body);
        pasangTombolPerPostingan();

        if (intervalUI) clearInterval(intervalUI);
        intervalUI = setInterval(() => {
            terjemahUINode(document.body);
            pasangTombolPerPostingan();
        }, 1500); // Mengecek elemen baru setiap 1.5 detik dengan santai
    }

    // ─── 6. TOMBOL FLOATING UTAMA (DESAIN SUPER TIPIS & TRANSPARAN) ────────────
    const btnTranslate = document.createElement('button');
    btnTranslate.id = "tof-translator-trigger";
    btnTranslate.style.cssText = `
        position: fixed;
        bottom: 12px;
        right: 12px;
        z-index: 999999;
        padding: 4px 8px;
        border-radius: 4px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        font-size: 10px;
        font-family: sans-serif;
        color: #999;
        background-color: rgba(255, 255, 255, 0.6);
        backdrop-filter: blur(2px);
        cursor: pointer;
        box-shadow: none;
        transition: all 0.2s ease;
    `;
    document.body.appendChild(btnTranslate);

    btnTranslate.onmouseover = () => { btnTranslate.style.backgroundColor = '#fff'; btnTranslate.style.color = '#2f6f4e'; btnTranslate.style.border = '1px solid #ccc'; };
    btnTranslate.onmouseout  = () => { btnTranslate.style.backgroundColor = 'rgba(255, 255, 255, 0.6)'; btnTranslate.style.color = '#999'; btnTranslate.style.border = '1px solid rgba(0, 0, 0, 0.08)'; };

    // Inisialisasi awal halaman dimuat
    if (statusBahasa === 'en') {
        btnTranslate.innerHTML = '🌐 ID';
        setTimeout(jalankanSistemPenerjemah, 1500); // Beri waktu supabase merender layout
    } else {
        btnTranslate.innerHTML = '🌐 EN';
    }

    // Event handler klik tombol utama
    btnTranslate.addEventListener('click', function () {
        if (statusBahasa === 'id') {
            localStorage.setItem('tof_bahasa_pilihan', 'en');
            btnTranslate.innerHTML = '🌐 ID';
            statusBahasa = 'en';
            jalankanSistemPenerjemah();
        } else {
            localStorage.setItem('tof_bahasa_pilihan', 'id');
            if (intervalUI) clearInterval(intervalUI);
            window.location.reload(); // Reload adalah jalan paling bersih mengembalikan instalan state medsos semula
        }
    });

})();