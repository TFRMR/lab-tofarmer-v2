// ===================== RANK & LEVEL (berbasis nilai aset nyata: XP + saldo TOF) =====================
// SATU-SATUNYA sumber kebenaran untuk rank & level di seluruh TOFarmer (dipakai app.js, login.js, dll).
// Istilah GROWER/PRO/SPECIALIST/ELITE (gaya game) sudah dihapus — sekarang semua pakai istilah kebun.
//
// Rank ditentukan dari total nilai aset (XP + saldo TOF, dikonversi ke setara TOF: 1 TOF = 1000 XP),
// bukan XP mentah — supaya benar-benar mencerminkan kekayaan warga di ekosistem TOF, termasuk yang
// sudah dicairkan ke dompet asli. Ambang batasnya dalam satuan TOF (1 TOF ≈ Rp1.000):
//   100 - 500 - 1.000 - 3.000 - 10.000 - 30.000 - 40.000 TOF
// Rank tertinggi (40.000 TOF ke atas, setara aset nyata ±Rp40 juta) levelnya TIDAK dibatasi —
// terus bertambah selama XP/saldo terus bertambah, tidak akan pernah mentok.

const XP_PER_TOF_RANK = 1000;

function hitungEffectiveXpRank(xp, saldoTof) {
  return (Number(xp) || 0) + (Number(saldoTof) || 0) * XP_PER_TOF_RANK;
}

// Tabel tingkatan rank kebun, diurutkan dari ambang batas TERTINGGI ke terendah.
const RANK_TIERS = [
  { minTof: 40000, label: "🌟 Legenda Tani Menoreh" },
  { minTof: 30000, label: "👑 Mahaguru Ladang" },
  { minTof: 10000, label: "🧙‍♂️ Sesepuh Kebun" },
  { minTof: 3000,  label: "👨‍🌾 Penguasa Lahan" },
  { minTof: 1000,  label: "🌱 Petani Teladan" },
  { minTof: 500,   label: "🌿 Pembasmi Gulma" },
  { minTof: 100,   label: "🍃 Penyiram Ulung" },
  { minTof: 0,     label: "🪵 Buruh Macul" },
];

// getRank menerima effectiveXp (bukan TOF langsung) supaya tetap konsisten dipanggil
// dari mana saja seperti sebelumnya: getRank(effectiveXp).
function getRank(effectiveXp) {
  const tof = (Number(effectiveXp) || 0) / XP_PER_TOF_RANK;
  const tier = RANK_TIERS.find(t => tof >= t.minTof);
  return tier ? tier.label : RANK_TIERS[RANK_TIERS.length - 1].label;
}

// Level terus bertambah TANPA batas (tidak lagi mentok di level 100 seperti dulu),
// dihitung langsung dari effectiveXp (XP + saldo TOF setara XP).
function getTofLevel(effectiveXp) {
  const xp = Number(effectiveXp) || 0;
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

function getRankStats(users) {
  const stats = {};
  RANK_TIERS.forEach(t => { stats[t.label] = 0; });

  users.forEach(u => {
    const effectiveXp = hitungEffectiveXpRank(u.xp, u.saldo_tof);
    const rank = getRank(effectiveXp);
    stats[rank] = (stats[rank] || 0) + 1;
  });

  return stats;
}

// Fungsi sinkronisasi render ringkasan pangkat di Beranda Ekonomi
async function loadRankSummary() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("xp, saldo_tof")

  if (error || !data) return

  const stats = getRankStats(data)
  const growerCountEl = document.getElementById("rankSummary")

  if (growerCountEl) {
    const ringkasan = RANK_TIERS
      .slice().reverse()
      .map(t => `${t.label.split(' ')[0]}${stats[t.label] || 0}`)
      .join(" ");
    growerCountEl.innerHTML = `Total-${data.length} ( ${ringkasan} )`
  }
}