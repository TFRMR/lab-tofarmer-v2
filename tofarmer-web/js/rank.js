// ===================== RANK & LEVEL PROGRESSIVE (MAX LVL 100) =====================

function getRank(xp) {
  if (xp >= 33000) return "ELITE"
  if (xp >= 9000) return "SPECIALIST"
  if (xp >= 3000) return "PRO"
  return "GROWER"
}

function getTofLevel(xp) {
  xp = xp || 0;

  // 1. GROWER: Level 1 - 10 (XP: 0 - 2999)
  if (xp < 3000) {
    return Math.floor(xp / 300) + 1; 
  }
  
  // 2. PRO: Level 11 - 30 (XP: 3000 - 8999)
  if (xp < 9000) {
    const proXp = xp - 3000;
    return 11 + Math.floor(proXp / 300);
  }
  
  // 3. SPECIALIST: Level 31 - 90 (XP: 9000 - 32999)
  if (xp < 33000) {
    const specXp = xp - 9000;
    return 31 + Math.floor(specXp / 400);
  }
  
  // 4. ELITE: Level 91 - 100 (XP: 33000+)
  const eliteXp = xp - 33000;
  const eliteLevel = 91 + Math.floor(eliteXp / 1000);
  return Math.min(eliteLevel, 100);
}

function getRankStats(users) {
  let grower = 0
  let pro = 0
  let specialist = 0
  let elite = 0

  users.forEach(u => {
    const xp = u.xp || 0
    const rank = getRank(xp)

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
    .select("xp")

  if (error || !data) return

  const stats = getRankStats(data)
  const growerCountEl = document.getElementById("rankSummary")

  if (growerCountEl) {
    growerCountEl.innerHTML = `Total-${data.length} ( 🌱${stats.grower} | 🥉${stats.pro} | 🥈${stats.specialist} | 🥇${stats.elite} )`
  }
}