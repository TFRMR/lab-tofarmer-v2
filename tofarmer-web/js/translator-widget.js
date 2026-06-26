
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

    // ─── CACHE TERJEMAHAN (hemat quota MyMemory) ──────────────────────────────
    const cache = {};

    // ─── SKIP TAG ──────────────────────────────────────────────────────────────
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'NOSCRIPT']);

    // ─── TERJEMAH UI STATIS (kamus lokal, instan) ─────────────────────────────
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

    // ─── TERJEMAH KONTEN POSTINGAN VIA MYMEMORY ───────────────────────────────
    async function terjemahMyMemory(teks) {
        const bersih = teks.trim();
        if (!bersih) return teks;
        if (cache[bersih]) return cache[bersih];

        try {
            const res = await fetch(
                `https://api.mymemory.translated.net/get?q=${encodeURIComponent(bersih)}&langpair=id|en`
            );
            const data = await res.json();
            if (data.responseStatus === 200 && data.responseData?.translatedText) {
                cache[bersih] = data.responseData.translatedText;
                return cache[bersih];
            }
        } catch (e) {
            console.warn('[TOF Translator] MyMemory error:', e);
        }
        return teks; // fallback ke teks asli
    }

    // Terjemahkan semua elemen .text (isi postingan) dan .comment (isi komentar)
    // Selector ini sesuai class yang dipakai di app.js dan profile.js
    async function terjemahSemuaPostingan() {
        // .text   → isi postingan utama (div.text di renderPostsBatch app.js baris 604)
        // span[style*="white-space:pre-wrap"] → isi komentar (app.js baris 646)
        const elemen = document.querySelectorAll(
            '.text:not([data-tof-done]), span[style*="white-space:pre-wrap"]:not([data-tof-done])'
        );

        for (const el of elemen) {
            el.setAttribute('data-tof-done', '1'); // tandai agar tidak diproses dua kali

            const teksAsli = el.innerText?.trim();
            if (!teksAsli || teksAsli.length < 3) continue;

            // Tanda loading: redup sementara
            el.style.opacity = '0.45';
            const hasil = await terjemahMyMemory(teksAsli);
            el.style.opacity = '1';

            if (hasil && hasil !== teksAsli) {
                // Ganti hanya konten teks, pertahankan innerHTML (ada mention/@user di dalamnya)
                // Cara aman: cari semua text node di dalamnya dan ganti
                gantiTextNodes(el, teksAsli, hasil);
            }
        }
    }

    // Ganti text node di dalam elemen tanpa merusak child element (misal <span> mention)
    function gantiTextNodes(el, teksAsli, teksHasil) {
        // Jika elemennya hanya berisi plain text (tidak ada child element)
        const punyaChildElement = Array.from(el.childNodes).some(n => n.nodeType === Node.ELEMENT_NODE);

        if (!punyaChildElement) {
            // Aman langsung ganti textContent
            el.textContent = teksHasil;
        } else {
            // Ada child element (misal <span> mention) — hanya ganti text node paling luar
            for (const node of el.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) {
                    // Terjemahkan per fragment teks
                    terjemahMyMemory(node.nodeValue.trim()).then(hasil => {
                        if (hasil && hasil !== node.nodeValue.trim()) {
                            node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), hasil);
                        }
                    });
                }
            }
        }
    }

    // ─── TOMBOL ────────────────────────────────────────────────────────────────
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

    btnTranslate.onmouseover = () => { btnTranslate.style.backgroundColor = '#fff'; btnTranslate.style.color = '#2f6f4e'; };
    btnTranslate.onmouseout  = () => { btnTranslate.style.backgroundColor = 'rgba(255,255,255,0.9)'; btnTranslate.style.color = '#666'; };

    // ─── OBSERVER ──────────────────────────────────────────────────────────────
    let observer = null;

    function mulaiSistemLoop() {
        // 1. Terjemah UI statis dulu (kamus lokal, instan)
        terjemahUINode(document.body);

        // 2. Terjemah postingan yang sudah ada di DOM
        terjemahSemuaPostingan();

        // 3. Pantau postingan baru (infinite scroll / Supabase realtime)
        if (observer) observer.disconnect();

        observer = new MutationObserver((mutations) => {
            let adaBaru = false;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    if (node.id === "tof-translator-trigger") continue;
                    terjemahUINode(node);
                    adaBaru = true;
                }
            }
            if (adaBaru) terjemahSemuaPostingan();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: false,
            attributes: false
        });
    }

    function hentikanSistemLoop() {
        if (observer) { observer.disconnect(); observer = null; }
    }

    // ─── INISIALISASI ──────────────────────────────────────────────────────────
    let statusBahasa = localStorage.getItem('tof_bahasa_pilihan') || 'id';

    if (statusBahasa === 'en') {
        btnTranslate.innerHTML = '🌐 ID';
        // Tunggu 2 detik agar Supabase selesai inject postingan ke DOM
        setTimeout(mulaiSistemLoop, 2000);
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


