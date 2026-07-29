import { supabase } from './supabase-client.js';

/* =========================================================================
   ⚙️ KONFIGURASI
   ========================================================================= */
const WORKER_URL = 'https://tofarmer-api.tofarmer-api.workers.dev/ai-saran';
const MAX_PESAN_DIKIRIM = 8;   // berapa pesan terakhir yg disertakan sbg konteks ke AI
const MAX_PESAN_DISIMPAN = 60; // cap biar localStorage nggak membengkak

/* =========================================================================
   🧠 1. INSTRUKSI DASAR (SYSTEM PROMPT) — kepribadian & batasan Mbah Eko
   Edit bebas di sini kalau mau ubah gaya bicara atau aturan jawab AI.
   ========================================================================= */
const SYSTEM_INSTRUKSI = `Kamu adalah "Mbah Eko", asisten AI resmi ToFarmer — ekosistem agraris berbasis Ilmu Baku dan otonomi kolektif dari Menoreh, Kulon Progo.

Gaya bicara kamu:
- Bahasa Indonesia santai, akrab, kadang selipkan istilah tani/kebun sebagai analogi. Sesekali boleh pakai "wkwk" kalau konteksnya memang santai, jangan dipaksakan.
- Jawab singkat dan langsung ke inti dulu, baru elaborasi kalau memang perlu. Hindari jawaban bertele-tele.
- Kamu bicara sebagai bagian dari komunitas ("kita"), bukan sebagai pihak luar yang menjelaskan ToFarmer dari jauh.

Batasan & aturan penting:
- Kamu HANYA membahas seputar ToFarmer: filosofi, 5 Pilar, Ilmu Baku, token TOF, XP & level, dashboard, Prasasti, desa-tof (game), dan hal teknis terkait platform.
- Kalau ditanya hal di luar topik itu, jawab singkat lalu ajak balik ke topik ToFarmer.
- Jangan pernah mengarang angka harga TOF real-time, saldo, atau data pribadi user — arahkan ke dashboard/profile untuk data live.
- Jangan janjikan keuntungan finansial pasti. Sistem TOF berbasis kontribusi nyata dan kejujuran proses, bukan skema cepat kaya.
- Kalau tidak yakin dengan jawaban, akui saja dan sarankan user cek ke komunitas/Titik Kumpul, jangan mengarang.`;

/* =========================================================================
   📚 2. BASIS PENGETAHUAN (RAG sederhana berbasis kata kunci)
   Tambah/edit entri kapan saja — tidak perlu ubah kode lain.
   Setiap entri: kataKunci (dicek ada di pesan user atau tidak) + konteks (ringkasan yg dikirim ke AI).
   ========================================================================= */
const BASIS_PENGETAHUAN = [
    {
        judul: "Latar Belakang",
        kataKunci: ["kenapa", "mengapa", "latar belakang", "alasan", "asal usul", "lahir"],
        konteks: "ToFarmer lahir karena ilmu petani senior sering hilang begitu saja saat mereka wafat, tak sempat diwariskan, sebab pertanian dianggap 'kerja otot' bukan 'kerja otak'. Petani sering berjuang sendirian melawan tengkulak, iklim, dan harga pupuk. ToFarmer ingin menjadikan setiap praktik di ladang sebagai data berharga dan setiap kegagalan sebagai pelajaran mulia, lewat 'Ilmu Baku' yang tersimpan abadi secara digital."
    },
    {
        judul: "Definisi Pertanian ala ToFarmer",
        kataKunci: ["definisi", "apa itu tofarmer", "arti tofarmer", "konsep"],
        konteks: "ToFarmer bukan bantuan sosial atau proyek kejar panen. ToFarmer adalah Ekosistem Pembelajaran Agraris berbasis praktik nyata: pertanian didefinisikan ulang sebagai aktivitas intelektual dan ekologis, di mana setiap jengkal tanah adalah laboratorium dan setiap petani adalah peneliti."
    },
    {
        judul: "Visi & Misi",
        kataKunci: ["visi", "misi", "tujuan", "cita-cita"],
        konteks: "Visi: pertanian jadi gaya hidup intelektual, petani dipandang sebagai sosok intelektual penghasil ilmu baku. Misi dijalankan lewat 3 langkah: Narasi Nyata (cerita apa adanya), Membangun Ilmu Baku (menyaring praktik jadi standar), dan Kemandirian Ekosistem (sistem ekonomi & teknologi yang berkelanjutan tanpa terus bergantung pihak luar)."
    },
    {
        judul: "5 Pilar Ekosistem",
        kataKunci: ["pilar", "5 pilar", "lima pilar", "struktur", "aksi 1", "aksi 2", "aksi 3", "aksi 4", "aksi 5"],
        konteks: "ToFarmer punya 5 Pilar yang saling mengunci: (1) Komunitas & Narasi Kreatif — menjaga nilai & jaringan; (2) Inovasi & Rekayasa Teknologi — alat fisik, digital, AI; (3) Ladang Belajar — laboratorium praktik/pembuktian nyata; (4) Finansial & Investasi — mengelola modal dan compounding aset komunitas; (5) Refleksi Petapa — kompas etika, memastikan gerakan tetap jujur dan manusiawi. Siklusnya: Ladang → data ke Teknologi → diolah, disebar Komunitas → didanai Finansial → diawasi arahnya oleh Petapa."
    },
    {
        judul: "Alur Masuk Komunitas (3 Fase)",
        kataKunci: ["gabung", "bergabung", "cara masuk", "jadi anggota", "ikut serta", "fase"],
        konteks: "Alur keterlibatan di ToFarmer ada 3 fase: (1) Fase Obrolan — diskusi santai, perkenalan nilai & gaya hidup, belum ada beban kerja; (2) Fase Aksi — mulai terlibat nyata di salah satu dari 5 Pilar, pembuktian niat lewat kontribusi; (3) Fase Integrasi — masuk siklus operasional formal, terlibat penuh di sistem ekonomi & teknologi, harus patuh Etika dan menguasai Ilmu Baku komunitas."
    },
    {
        judul: "Etika Dasar",
        kataKunci: ["etika", "aturan", "nilai", "prinsip", "kompas"],
        konteks: "4 etika dasar ToFarmer: Kejujuran Proses (data harus dari pengalaman nyata, kegagalan jujur lebih dihargai daripada klaim rekayasa), Aksi Tanpa Paksaan (partisipasi sukarela), Proses di Atas Hasil (nilai dari pelajaran & refleksi, bukan sekadar untung besar cepat), dan Menghormati Hubungan (menjaga martabat manusia dan keseimbangan ekologis)."
    },
    {
        judul: "Ilmu Baku — Hakikat & Tahapan",
        kataKunci: ["ilmu baku", "validasi", "tahapan ilmu", "gate", "status ilmu", "rujukan operasional", "catatan praktik"],
        konteks: "Ilmu Baku bukan kebenaran mutlak, sifatnya provisional (sementara) — berlaku sampai ada metode lain yang lebih baik. Tahapan kematangan ilmu: Catatan Praktik (bahan mentah) → Rujukan Operasional (mulai stabil setelah diulang) → Ilmu Baku (teruji konsisten, jadi standar rujukan bersama) → Revisi (diperbarui kalau ada rumus lebih akurat) → Arsip Pembelajaran (ilmu lama disimpan sebagai jejak sejarah). Proses validasi mencatat 4 hal: Konteks, Proses, Hasil, dan Refleksi dari setiap praktik."
    },
    {
        judul: "Peran AI dan Manusia",
        kataKunci: ["ai", "peran ai", "mbah eko", "kecerdasan buatan", "otak kolektif"],
        konteks: "AI di ToFarmer bertugas sebagai pustakawan & analis: merapikan dokumentasi, mendeteksi pola antar ladang, dan menjaga konsistensi data. Tapi otoritas tertinggi tetap di tangan manusia — AI hanya memberi rekomendasi, manusia yang memutuskan status Ilmu Baku dan menjaga kompas etika (Pilar 5), karena AI tak punya 'rasa' dan konteks moral. Bersama, ini disebut 'Otak Kolektif': AI menyumbang kecepatan & memori, manusia menyumbang kebijaksanaan dan empati."
    },
    {
        judul: "Token TOF & Strategi Nabung Receh",
        kataKunci: ["tof", "token", "harga", "nabung receh", "aset", "modal"],
        konteks: "TOF adalah token ASA di jaringan Algorand (ASA ID 3558306283). Filosofi ekonominya disebut 'Nabung Receh': mengumpulkan aset sedikit demi sedikit dari setiap aktivitas komunitas menjadi Uang Dingin (modal tanpa beban utang). Sebagai acuan internal awal, 1 TOF setara Rp1000 — harga pasar riil TOF di luar itu bisa berbeda dan berubah-ubah, sebaiknya dicek langsung di dashboard/chart. Target bertahap: Fase 1 (100 TOF, lulus), Fase 2 (500 TOF, lulus), Fase 3 (1000 TOF, target saat ini)."
    },
    {
        judul: "Mekanisme Compounding",
        kataKunci: ["compounding", "bunga berbunga", "500k", "otomatis"],
        konteks: "Begitu aset komunitas menyentuh 500.000 (Titik Aktivasi), ToFarmer mulai menjalankan compounding: target hasil 5-10% per bulan dari total aset, dikelola lewat bidang usaha/investasi yang disepakati bersama. Tujuan akhirnya adalah 'Gaji Otomatis' — hasil pengelolaan bulanan cukup untuk menjalankan program ToFarmer tanpa pusing biaya."
    },
    {
        judul: "Protokol XP & Cara Dapat XP",
        kataKunci: ["xp", "poin", "level up", "cara dapat xp", "naik level"],
        konteks: "XP didapat dari kontribusi ke 5 Pilar: Bikin Ilmu Baku (+100 XP), Aktif di Web & Dashboard (+20 XP), Sapa & Diskusi Nilai (5-15 XP), Gagasan & Validasi Ilmu (+50 XP), Dokumentasi Praktik Ladang (+25 XP), Narasi Intelektual/Vlog (+50 XP), Kontribusi Modal Aset (+30 XP). Setiap akumulasi 100 XP, level otomatis naik."
    },
    {
        judul: "Tangga Pangkat / Level",
        kataKunci: ["pangkat", "level", "buruh macul", "sesepuh kebun", "legenda tani", "rank"],
        konteks: "Tangga pangkat berdasarkan minimal TOF: Buruh Macul (0 TOF, belajar & adaptasi) → Penyiram Ulung (100 TOF) → Pembasmi Gulma (500 TOF, validasi) → Petani Teladan (1.000 TOF, jadi rujukan operasional) → Penguasa Lahan (3.000 TOF) → Sesepuh Kebun (10.000 TOF, pilar ilmu baku komunitas) → Mahaguru Ladang (30.000 TOF, mentorship) → Legenda Tani Menoreh (40.000 TOF, penjaga visi jangka panjang)."
    },
    {
        judul: "Skema Batas Penarikan (SBP)",
        kataKunci: ["tarik", "penarikan", "withdraw", "sbp", "cairkan"],
        konteks: "Skema Batas Penarikan (SBP) menjaga arus kas ekosistem tetap sehat: hak tarik makin besar seiring level makin tinggi. Level 1-10 hanya bisa tarik 10%, Level 11-30 sekitar 20-30%, hingga Level 91-99 bisa 100% sebagai bentuk kepercayaan penuh pada penjaga senior sistem."
    },
    {
        judul: "Etika Exit / Keluar",
        kataKunci: ["keluar", "exit", "berhenti", "3 kali"],
        konteks: "Kejujuran adalah hukum tertinggi — data rekayasa akan merusak sistem. Menarik seluruh aset 100% dianggap Exit (keluar dari sirkulasi manfaat). Kesempatan bergabung kembali dibatasi maksimal 3 kali karena ToFarmer mencari komitmen, bukan oportunis."
    },
    {
        judul: "Keberlanjutan & Regenerasi",
        kataKunci: ["regenerasi", "keberlanjutan", "estafet", "generasi baru"],
        konteks: "Keberlanjutan dijaga 3 sirkulasi: Manfaat (kesejahteraan ekonomi dari Pilar 4), Pengetahuan (database Ilmu Baku bikin anggota baru tak perlu meraba dari nol), dan Peran (estafet tanggung jawab kolektif). Regenerasi berjalan alami lewat 3 tahap: Belajar (di Ladang) → Kontribusi (di Inovasi/Komunitas) → Pendampingan (jadi mentor generasi berikut)."
    }
];

/**
 * Cari konteks paling relevan dari BASIS_PENGETAHUAN berdasarkan kata kunci di pesan user.
 * Ini RAG sederhana berbasis keyword-matching, bukan vector search — cukup untuk skala
 * pengetahuan ToFarmer saat ini. Kalau nanti kontennya sudah sangat banyak, pertimbangkan
 * pindah ke Supabase pgvector + embeddings untuk pencarian semantik yang lebih presisi.
 */
function cariKonteks(pesanUser, maxHasil = 3) {
    const teks = pesanUser.toLowerCase();
    const skor = BASIS_PENGETAHUAN
        .map(entry => {
            let nilai = 0;
            entry.kataKunci.forEach(k => { if (teks.includes(k.toLowerCase())) nilai++; });
            return { entry, nilai };
        })
        .filter(s => s.nilai > 0)
        .sort((a, b) => b.nilai - a.nilai)
        .slice(0, maxHasil);

    if (skor.length === 0) return "";
    return skor.map(s => `[${s.entry.judul}] ${s.entry.konteks}`).join("\n\n");
}

// Dipakai juga oleh halaman lain (pola sama dengan window.cariKonteksDashboard di dashboard)
window.cariKonteksAI = cariKonteks;

/* =========================================================================
   💾 3. MEMORI PERCAKAPAN (localStorage per user)
   ========================================================================= */
const rawUserId = localStorage.getItem('tof_user_id') || localStorage.getItem('tof_wallet');
const userId = rawUserId || 'tamu';
const HISTORY_KEY = `tof_chat_history_${userId}`;

let riwayat = muatRiwayat();

function muatRiwayat() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function simpanRiwayat() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(riwayat.slice(-MAX_PESAN_DISIMPAN)));
}

function hapusRiwayat() {
    riwayat = [];
    localStorage.removeItem(HISTORY_KEY);
}

/* =========================================================================
   🖼️ 4. RENDER UI
   ========================================================================= */
const chatArea = document.getElementById('chat-area');
const emptyState = document.getElementById('empty-state');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const clearBtn = document.getElementById('clear-btn');
const riwayatInfo = document.getElementById('riwayat-info');

function updateRiwayatInfo() {
    riwayatInfo.innerText = riwayat.length > 0
        ? `${riwayat.length} pesan tersimpan di perangkat ini`
        : 'Asisten kebun ToFarmer';
}

function scrollKeBawah() {
    chatArea.scrollTop = chatArea.scrollHeight;
}

function tambahBubble(role, teks) {
    if (emptyState) emptyState.style.display = 'none';

    const row = document.createElement('div');
    row.className = `msg-row ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.innerText = role === 'user' ? '🧑‍🌾' : '🌾';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerText = teks;

    row.appendChild(avatar);
    row.appendChild(bubble);
    chatArea.appendChild(row);
    scrollKeBawah();
    return bubble;
}

function tambahThinking() {
    if (emptyState) emptyState.style.display = 'none';

    const row = document.createElement('div');
    row.className = 'msg-row assistant';
    row.id = 'thinking-row';

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.innerText = '🌾';

    const bubble = document.createElement('div');
    bubble.className = 'bubble thinking-dots';
    bubble.innerHTML = '<span></span><span></span><span></span>';

    row.appendChild(avatar);
    row.appendChild(bubble);
    chatArea.appendChild(row);
    scrollKeBawah();
    return row;
}

function hapusThinking() {
    const el = document.getElementById('thinking-row');
    if (el) el.remove();
}

function typeWriterBubble(bubbleEl, teks, speed = 18) {
    let i = 0;
    bubbleEl.innerHTML = '<span class="cursor"></span>';
    const interval = setInterval(() => {
        if (i < teks.length) {
            bubbleEl.textContent = teks.slice(0, i + 1);
            i++;
            scrollKeBawah();
        } else {
            clearInterval(interval);
            bubbleEl.textContent = teks;
        }
    }, speed);
}

function renderRiwayatAwal() {
    if (riwayat.length === 0) return;
    riwayat.forEach(m => tambahBubble(m.role, m.text));
    updateRiwayatInfo();
}

/* =========================================================================
   📡 5. KIRIM PESAN KE AI (Cloudflare Worker /ai-saran)
   ========================================================================= */
async function kirimPesan(pesanUser) {
    tambahBubble('user', pesanUser);
    riwayat.push({ role: 'user', text: pesanUser, ts: Date.now() });
    simpanRiwayat();
    updateRiwayatInfo();

    tambahThinking();

    const konteksRAG = cariKonteks(pesanUser);
    const riwayatSingkat = riwayat
        .slice(-MAX_PESAN_DIKIRIM)
        .map(m => `${m.role === 'user' ? 'User' : 'Mbah Eko'}: ${m.text}`)
        .join('\n');

    // Semua digabung jadi satu field "teks" karena worker /ai-saran saat ini
    // hanya membaca field itu (sama seperti dipakai di dashboard.js).
    const promptLengkap = [
        SYSTEM_INSTRUKSI,
        konteksRAG ? `\nKonteks pengetahuan relevan:\n${konteksRAG}` : '',
        `\nPercakapan sejauh ini:\n${riwayatSingkat}`,
        `\nBalas sebagai Mbah Eko, jawab pesan terakhir user secara langsung dan hangat.`
    ].join('\n');

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: 'AI-Chat',
                trigger: 'chat-page',
                teks: promptLengkap
            })
        });
        const result = await response.json();
        const balasan = result.saran || 'Waduh, Mbah Eko lagi di sawah. Coba tanya lagi ya 🌿';

        hapusThinking();
        const bubbleEl = tambahBubble('assistant', '');
        typeWriterBubble(bubbleEl, balasan);

        riwayat.push({ role: 'assistant', text: balasan, ts: Date.now() });
        simpanRiwayat();
        updateRiwayatInfo();
    } catch (e) {
        hapusThinking();
        tambahBubble('assistant', 'Sinyal ke kebun terputus. Coba lagi sebentar ya 🌿');
    }
}

/* =========================================================================
   🎛️ 6. EVENT HANDLERS
   ========================================================================= */
function autoResizeInput() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
}

function kirimDariInput() {
    const pesan = chatInput.value.trim();
    if (!pesan) return;
    chatInput.value = '';
    autoResizeInput();
    kirimPesan(pesan);
}

sendBtn.addEventListener('click', kirimDariInput);

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        kirimDariInput();
    }
});

chatInput.addEventListener('input', autoResizeInput);

document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => kirimPesan(chip.dataset.q));
});

clearBtn.addEventListener('click', () => {
    if (!confirm('Hapus semua riwayat obrolan di perangkat ini?')) return;
    hapusRiwayat();
    chatArea.innerHTML = '';
    chatArea.appendChild(emptyState);
    emptyState.style.display = 'block';
    updateRiwayatInfo();
});

/* =========================================================================
   🚀 INIT
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
    renderRiwayatAwal();
    updateRiwayatInfo();
});