// --- SINKRONISASI CARD PROFILE USER DI BERANDA ---
function renderProfile() {
  if (!currentProfile) return

  const userBox = document.getElementById("profileInfo")
  if (!userBox) return

  // Hitung Level dan Rank secara dinamis berdasarkan XP asli dari Supabase
  const calculatedLevel = getTofLevel(currentProfile.xp || 0)
  const calculatedRank = getRank(currentProfile.xp || 0)

  // Pasang badge emoji visual untuk pangkat beranda
  let rankEmoji = "🌱 GROWER"
  if (calculatedRank === "PRO") rankEmoji = "🥉 PRO"
  if (calculatedRank === "SPECIALIST") rankEmoji = "🥈 SPECIALIST"
  if (calculatedRank === "ELITE") rankEmoji = "🥇 ELITE"

  userBox.innerHTML = `
    <div style="font-weight:700;font-size:16px;color:#2f6f4e;cursor:pointer;" 
         onclick="window.location.href='profile.html?u=${currentProfile.username}'">
         @${currentProfile.username}
    </div>
    <div style="margin-top:12px; display:grid; grid-template-columns:1fr 1fr; gap:10px;">
      <div class="card" style="padding:10px;margin:0;">
        <div style="font-size:11px;color:#888;">XP</div>
        <div style="font-weight:700;">${Math.floor(currentProfile.xp || 0)}</div>
      </div>
      <div class="card" style="padding:10px;margin:0;">
        <div style="font-size:11px;color:#888;">TOF</div>
        <div style="font-weight:700; color:#c9a227;">${Number(currentProfile.saldo_tof || 0).toLocaleString()}</div>
      </div>
    </div>
    <div style="margin-top:10px; background:#eef7f1; border-radius:999px; padding:8px 14px; display:inline-block; color:#2f6f4e; font-size:12px; font-weight:600;">
      ${rankEmoji} • Level ${calculatedLevel}
    </div>
  `
}

// --- SINKRONISASI STATS EKONOMI DI ATAS BERANDA ---
async function loadEconomy() {
  const { data: profiles, error } = await supabaseClient
    .from("profiles")
    .select("xp, saldo_tof")

  if (error || !profiles) return

  // Hitung total sirkulasi saldo_tof di ekosistem
  let totalTofEdar = 0
  profiles.forEach(p => {
    totalTofEdar += Number(p.saldo_tof || 0)
  })

  const totalTofEl = document.getElementById("totalTof")
  if (totalTofEl) {
    totalTofEl.innerText = totalTofEdar.toLocaleString()
  }

  // Update statistik distribusi pangkat agar tidak bernilai 0
  const growerEl = document.getElementById("rankSummary")
  if (growerEl && typeof getRankStats === "function") {
    const stats = getRankStats(profiles)
    growerEl.innerHTML = `Total-${profiles.length} ( 🌱${stats.grower} | 🥉${stats.pro} | 🥈${stats.specialist} | 🥇${stats.elite} )`
  }
}