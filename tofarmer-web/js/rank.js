// ===================== RANK & LEVEL PROGRESSIVE (MAX LVL 100) =====================

// Ditambahkan di bagian paling atas blok sebagai acuan global
const XP_PER_TOF = 1000;
function hitungEffectiveXp(xp, saldoTof) {
  return (Number(xp) || 0) + (Number(saldoTof) || 0) * XP_PER_TOF;
}

function getRank(effectiveXp) {
  if (effectiveXp >= 33000) return "ELITE"
  if (effectiveXp >= 9000) return "SPECIALIST"
  if (effectiveXp >= 3000) return "PRO"
  return "GROWER"
}

function getTofLevel(effectiveXp) {
  effectiveXp = effectiveXp || 0;

  // 1. GROWER: Level 1 - 10 (XP: 0 - 2999)
  if (effectiveXp < 3000) {
    return Math.floor(effectiveXp / 300) + 1; 
  }
  
  // 2. PRO: Level 11 - 30 (XP: 3000 - 8999)
  if (effectiveXp < 9000) {
    const proXp = effectiveXp - 3000;
    return 11 + Math.floor(proXp / 300);
  }
  
  // 3. SPECIALIST: Level 31 - 90 (XP: 9000 - 32999)
  if (effectiveXp < 33000) {
    const specXp = effectiveXp - 9000;
    return 31 + Math.floor(specXp / 400);
  }
  
  // 4. ELITE: Level 91 - 100 (XP: 33000+)
  const eliteXp = effectiveXp - 33000;
  const eliteLevel = 91 + Math.floor(eliteXp / 1000);
  return Math.min(eliteLevel, 100);
}

function getRankStats(users) {
  let grower = 0
  let pro = 0
  let specialist = 0
  let elite = 0

  users.forEach(u => {
    // KOMPAK: Menghitung secara efektif dengan menyertakan saldo_tof dari DB
    const effXp = hitungEffectiveXp(u.xp, u.saldo_tof)
    const rank = getRank(effXp)

    if (rank === "ELITE") elite++
    else if (rank === "SPECIALIST") specialist++
    else if (rank === "PRO") pro++
    else grower++
  })

  return { grower, pro, specialist, elite }
}

// Fungsi sinkronisasi render ringkasan pangkat di Beranda Ekonomi
async function loadRankSummary() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("xp, saldo_tof") // KOMPAK: Wajib tarik kolom saldo_tof juga

  if (error || !data) return

  const stats = getRankStats(data)
  const growerCountEl = document.getElementById("rankSummary")

  if (growerCountEl) {
    growerCountEl.innerHTML = `Total-${data.length} ( 🌱${stats.grower} | 🥉${stats.pro} | 🥈${stats.specialist} | 🥇${stats.elite} )`
  }
}