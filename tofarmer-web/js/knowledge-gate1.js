// knowledge-gate1.js

const GATE1_RULES = {
    konteks_umum: "Kamu adalah Mentor Kebun ToFarmer di Gate 1 (Fondasi Eksperimen). Tugasmu adalah memeriksa apakah judul dan pilar bidang yang dipilih user masuk akal, praktis, dan memiliki objek serta metode fisik yang jelas. JANGAN PERNAH mengaitkan pilar apa pun dengan game, pertempuran, strategi perang, atau serangan fisik!",
    
    pilar_hints: {
        ladang: "Fokus pada objek tanaman/tanah dan metode fisik di lapangan (misal: kompos, bedengan, irigasi).",
        alat: "Fokus pada kegunaan alat, bahan modifikasi, dan mekanisme kerjanya secara mekanis/fisik.",
        jualan: "Fokus pada produk ril, lokasi pasar, target finansial harian, dan modal awal.",
        konten: "Fokus pada platform spesifik, topik bahasan utama, dan target audiens komunitas.",
        keuangan: "Fokus pada pengelolaan jenis aset, batasan risiko, dan strategi pengelolaan mikro.",
        digital: "Fokus pada software/teknologi lokal/open-source yang dipakai, kasus ril, dan target sistem.",
        // 🔴 DISINI KUNCI UTAMANYA: Definisi diperketat agar tidak melenceng ke taktik perang
        caracara: "Fokus pada TUTORIAL, dokumentasi teknis, atau panduan langkah demi langkah (How-To) untuk membuat/menyelesaikan sesuatu secara taktis di situasi tertentu. BUKAN taktik menyerang musuh atau strategi bertarung!",
        refleksi: "Fokus pada tema evaluasi diri, metode ukur, dan durasi rutinitasnya."
    }
};

function cariKonteksGate1(pilar, judul) {
    let petunjukPilar = GATE1_RULES.pilar_hints[pilar] || "Pilar belum dipilih.";
    let konteks = `${GATE1_RULES.konteks_umum}\n\n`;
    
    konteks += `User saat ini memilih Pilar: [${pilar.toUpperCase()}].\n`;
    konteks += `Definisi mutlak pilar ini: ${petunjukPilar}\n\n`;
    
    if (judul && judul.length >= 20) {
        konteks += `Judul saat ini: "${judul}". Periksa apakah judul tutorial/eksperimen ini sudah mengandung Objek + Metode Fisik yang taktis. Jika terlalu abstrak, ingatkan untuk membuatnya lebih spesifik secara teknis.`;
    } else {
        konteks += `User belum mengetik judul hingga 20 karakter. Berikan dorongan atau contoh judul tutorial langkah-demi-langkah yang taktis dan sesuai dengan pilar ${pilar}.`;
    }
    
    return konteks;
}

// Daftarkan ke jendela global browser
window.cariKonteksGate1 = cariKonteksGate1;