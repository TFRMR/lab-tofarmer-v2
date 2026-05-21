// ===================== RANK =====================

function getRank(xp) {
  if (xp >= 33000) return "ELITE"
  if (xp >= 9000) return "SPECIALIST"
  if (xp >= 3000) return "PRO"
  return "GROWER"
}

function getTofLevel(xp) {
  if (xp >= 33000) return 4
  if (xp >= 9000) return 3
  if (xp >= 3000) return 2
  return 1
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

  return {
    grower,
    pro,
    specialist,
    elite
  }
}

async function loadRankSummary() {
  const { data } =
    await supabaseClient
      .from("profiles")
      .select("xp")

  if (!data) return

  const stats =
    getRankStats(data)

  const growerCountEl =
    document.getElementById(
      "growerCount"
    )

  if (growerCountEl) {
    growerCountEl.innerHTML =
      `${data.length}
      (🌱${stats.grower}
      | 🥉${stats.pro}
      | 🥈${stats.specialist}
      | 🥇${stats.elite})`
  }
}