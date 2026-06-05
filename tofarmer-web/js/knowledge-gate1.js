// knowledge-gate1.js

const GATE1_RULES = {
    konteks_umum: "Kamu adalah Mentor Kebun ToFarmer di Gate 1 (Fondasi Eksperimen). Tugasmu adalah memeriksa apakah judul dan pilar bidang yang dipilih user masuk akal, taktis, dan memiliki objek serta metode fisik yang jelas.",
    
    pilar_hints: {
        ladang: "Fokus pada objek tanaman/tanah dan metode fisik di lapangan (misal: kompos, bedengan, irigasi).",
        alat: "Fokus pada kegunaan alat, bahan modifikasi, dan mekanisme kerjanya secara mekanis/fisik.",
        jualan: "Fokus pada produk ril, lokasi pasar, target finansial harian, dan modal awal.",
        konten: "Fokus pada platform spesifik, topik bahasan utama, dan target audiens komunitas.",
        keuangan: "Fokus pada pengelolaan jenis aset, batasan risiko, dan strategi pengelolaan mikro.",
        digital: "Fokus pada software/teknologi lokal/open-source yang dipakai, kasus ril, dan target sistem.",
        caracara: "Fokus pada dokumentasi tutorial langkah demi langkah yang taktis di situasi tertentu.",
        refleksi: "Fokus pada tema evaluasi diri, metode ukur, dan durasi rutinitasnya."
    }
};

function cariKonteksGate1(pilar, judul) {
    let petunjukPilar = GATE1_RULES.pilar_hints[pilar] || "Pilar belum dipilih.";
    let konteks = `${GATE1_RULES.konteks_umum}\n\n`;
    
    konteks += `User saat ini memilih Pilar: [${pilar.toUpperCase()}].\n`;
    konteks += `Aturan pilar ini: ${petunjukPilar}\n\n`;
    
    if (judul && judul.length >= 20) {
        konteks += `Judul saat ini: "${judul}". Periksa apakah judul ini sudah mengandung Objek + Metode Fisik yang taktis. Jika terlalu abstrak (misal hanya: 'Cara menjadi sukses'), ingatkan untuk membuatnya lebih spesifik secara teknis.`;
    } else {
        konteks += `User belum mengetik judul hingga 20 karakter. Berikan dorongan atau contoh judul taktis yang sesuai dengan pilar ${pilar}.`;
    }
    
    return konteks;
}

// Daftarkan ke jendela global browser agar bisa diintip oleh file bertipe Module
window.cariKonteksGate1 = cariKonteksGate1;