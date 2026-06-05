// knowledge-gate2.js

const GATE2_RULES = {
    konteks_umum: "Kamu adalah Mentor Kebun ToFarmer di Gate 2 (Anatomi Hipotesis). Tugasmu adalah mengevaluasi ketajaman Taktik, Baseline, dan Target yang diajukan user berdasarkan fondasi ilmu yang sudah mereka kunci di Gate 1.",
    
    panduan_kolom: {
        taktik: "Kolom TAKTIK: Evaluasi apakah ini benar-benar sebuah metode baru yang taktis, spesifik, dan bisa dieksekusi. Jangan biarkan user mengisi taktik yang abstrak.",
        baseline: "Kolom BASELINE: Evaluasi apakah kondisi cara lama/kondisi awal sebelum eksperimen ini terukur atau berdasar pada pengalaman ril.",
        target: "Kolom TARGET: Evaluasi apakah ekspektasi hasil setelah eksperimen ini masuk akal, memiliki angka, durasi, atau indikator keberhasilan yang jelas."
    }
};

function cariKonteksGate2(fieldId, dataGate1) {
    let konteks = `${GATE2_RULES.konteks_umum}\n\n`;
    
    // Suntikkan data fondasi dari Gate 1 ke dalam memori AI
    if (dataGate1) {
        konteks += "--- FONDASI ILMU DARI GATE 1 ---\n";
        konteks += `Pilar Bidang: ${dataGate1.pilar_bidang || '-'}\n`;
        konteks += `Judul Eksperimen: ${dataGate1.judul_eksperimen || '-'}\n`;
        konteks += `Kalimat Baku: "${dataGate1.kalimat_baku_compiled || '-'}"\n`;
        konteks += "--------------------------------\n\n";
    }
    
    // Ambil fokus evaluasi sesuai kolom tempat user menekan tombol refresh
    konteks += GATE2_RULES.panduan_kolom[fieldId] || "Evaluasi secara umum.";
    
    return konteks;
}

// Daftarkan ke global window agar bisa diakses oleh gate-2.js (Module)
window.cariKonteksGate2 = cariKonteksGate2;