// ===================== RANK & LEVEL PROGRESSIVE (MAX LVL 100) =====================

function getRank(xp) {
  if (xp >= 33000) return "ELITE"[cite: 17]
  if (xp >= 9000) return "SPECIALIST"[cite: 17]
  if (xp >= 3000) return "PRO"[cite: 17]
  return "GROWER"[cite: 17]
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
    return 31 + Math.floor(specXp / 400); // Dibagi rentang 400 XP per level agar muat 60 tingkat
  }
  
  // 4. ELITE: Level 91 - 100 (XP: 33000+)
  const eliteXp = xp - 33000;
  const eliteLevel = 91 + Math.floor(eliteXp / 1000);
  return Math.min(eliteLevel, 100); // Mentok dan dikunci di Level 100
}

function getRankStats(users) {
  let grower = 0
  let pro = 0
  let specialist = 0
  let elite = 0

  users.forEach(u => {
    const xp = u.xp || 0[cite: 17]
    const rank = getRank(xp)[cite: 17]

    if (rank === "ELITE") elite++[cite: 17]
    else if (rank === "SPECIALIST") specialist++[cite: 17]
    else if (rank === "PRO") pro++[cite: 17]
    else grower++[cite: 17]
  })

  return {
    grower,
    pro,
    specialist,
    elite
  }[cite: 17]
}

async function loadRankSummary() {
  const { data } =[cite: 17]
    await supabaseClient[cite: 17]
      .from("profiles")[cite: 17]
      .select("xp")[cite: 17]

  if (!data) return[cite: 17]

  const stats =[cite: 17]
    getRankStats(data)[cite: 17]

  const growerCountEl =[cite: 17]
    document.getElementById([cite: 17]
      "growerCount"[cite: 17]
    )[cite: 17]

  if (growerCountEl) {[cite: 17]
    growerCountEl.innerHTML =[cite: 17]
      `${data.length}
      (🌱${stats.grower}
      | 🥉${stats.pro}
      | 🥈${stats.specialist}
      | 🥇${stats.elite})`[cite: 17]
  }
}