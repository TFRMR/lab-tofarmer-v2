// /tofarmer-web/public/js/translator-widget.js
(function () {

    // ─── KAMUS UI STATIS ───────────────────────────────────────────────────────
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

    // ─── CACHE TERJEMAHAN ──────────────────────────────────────────────────────
    // Supaya teks yang sama tidak di-request dua kali ke MyMemory
    const cacheMyMemory = {};

    // ─── SELECTOR KONTEN POSTINGAN ─────────────────────────────────────────────
    // Sesuaikan dengan class/selector elemen postingan di web kamu
    const SELECTOR_POSTINGAN = [
        '.post-content',
        '.post-body',
        '.card-text',
        '.feed-text',
        '.comment-text',
        '[data-post-content]',
        '[data-content]'
    ].join(', ');

    // ─── SKIP TAG ──────────────────────────────────────────────────────────────
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'NOSCRIPT', 'TEXTAREA']);

    // ─── TERJEMAH UI STATIS ────────────────────────────────────────────────────
    function terjemahUINode(node) {
        if (!node) return;
        if (node.nodeType === Node.ELEMENT_NODE && node.id === "tof-translator-trigger") return;

        if (node.nodeType === Node.TEXT_NODE) {
            if (!node.nodeValue || !node.nodeValue.trim()) return;
            for (const [kunci, nilai] of Object.entries(kamusUI)) {
                if (node.nodeValue.includes(kunci) && !node.nodeValue.includes(nilai)) {
                    node.nodeValue = node.nodeValue.replace(kunci, nilai);
                }
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (SKIP_TAGS.has(node.tagName)) return;
            if ((node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') && node.placeholder) {
                for (const [kunci, nilai] of Object.entries(kamusUI)) {
                    if (node.placeholder.includes(kunci) && !node.placeholder.includes(nilai)) {
                        node.placeholder = node.placeholder.replace(kunci, nilai);
                    }
                }
            }
            for (let i = 0; i < node.childNodes.length; i++) {
                terjemahUINode(node.childNodes[i]);
            }
        }
    }

    // ─── TERJEMAH KONTEN DINAMIS DENGAN MYMEMORY ──────────────────────────────
    async function terjemahDenganMyMemory(teks) {
        if (!teks || !teks.trim()) return teks;

        // Cek cache dulu
        if (cacheMyMemory[teks]) return cacheMyMemory[teks];

        try {
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(teks)}&langpair=id|en`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
                const hasil = data.responseData.translatedText;
                cacheMyMemory[teks] = hasil; // simpan ke cache
                return hasil;
            }
        } catch (err) {
            console.warn('[TOF Translator] MyMemory gagal:', err);
        }

        return teks; // fallback ke teks asli kalau gagal
    }

    // Ambil semua elemen postingan yang belum diterjemahkan dan terjemahkan
    async function terjemahSemuaPostingan() {
        const elemen = document.querySelectorAll(SELECTOR_POSTINGAN);
        for (const el of elemen) {
            // Tandai supaya tidak diterjemahkan dua kali
            if (el.dataset.tofTranslated === 'true') continue;
            el.dataset.tofTranslated = 'true';

            const teksAsli = el.innerText.trim();
            if (!teksAsli) continue;

            // Tampilkan loading sementara
            el.style.opacity = '0.5';
            const hasil = await terjemahDenganMyMemory(teksAsli);
            el.style.opacity = '1';

            // Ganti hanya text node langsung, bukan innerHTML (aman dari XSS)
            gantiTextNodeSaja(el, teksAsli, hasil);
        }
    }

    // Ganti teks di dalam elemen tanpa merusak struktur HTML
    function gantiTextNodeSaja(el, teksAsli, teksHasil) {
        if (teksAsli === teksHasil) return;

        // Jika elemennya hanya punya 1 text node langsung, ganti langsung
        const childNodes = Array.from(el.childNodes);
        const hanyaTextNode = childNodes.every(n => n.nodeType === Node.TEXT_NODE);

        if (hanyaTextNode) {
            el.textContent = teksHasil;
        } else {
            // Kalau ada elemen campuran (span, a, dll), ganti per text node
            for (const node of childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) {
                    // Terjemahkan masing-masing text node kecil
                    terjemahDenganMyMemory(node.nodeValue.trim()).then(hasil => {
                        node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), hasil);
                    });
                }
            }
        }
    }

    // ─── TOMBOL TRANSLATOR ─────────────────────────────────────────────────────
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

    // ─── OBSERVER ──────────────────────────────────────────────────────────────
    let observer = null;

    function mulaiSistemLoop() {
        // 1. Terjemah UI statis dulu (kamus, instan)
        terjemahUINode(document.body);

        // 2. Terjemah postingan yang sudah ada
        terjemahSemuaPostingan();

        // 3. Pantau postingan baru yang masuk (lazy load / infinite scroll)
        if (observer) observer.disconnect();
        observer = new MutationObserver((mutations) => {
            let adaNodeBaru = false;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.id === "tof-translator-trigger") continue;
                    terjemahUINode(node);
                    adaNodeBaru = true;
                }
            }
            // Terjemah postingan baru kalau ada node baru
            if (adaNodeBaru) terjemahSemuaPostingan();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: false,
            attributes: false
        });
    }

    function hentikanSistemLoop() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }

    // ─── INISIALISASI ──────────────────────────────────────────────────────────
    let statusBahasa = localStorage.getItem('tof_bahasa_pilihan') || 'id';

    if (statusBahasa === 'en') {
        btnTranslate.innerHTML = '🌐 ID';
        setTimeout(mulaiSistemLoop, 1500);
    } else {
        btnTranslate.innerHTML = '🌐 EN';
    }

    btnTranslate.addEventListener('click', function () {
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