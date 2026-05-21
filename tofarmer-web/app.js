

let currentWallet = null
let currentProfile = null



// ===================== WALLET =====================
async function connectWallet() {
  const wallet = prompt("Masukkan wallet address Algorand:")
  if (!wallet) return

  currentWallet = wallet
  localStorage.setItem("tof_wallet", wallet)

  await syncProfile(wallet)

  updateWalletUI()
  renderProfile()

  alert(
  "🌿 Wallet tersambung!"
)
}

function logoutWallet() {
  currentWallet = null
  currentProfile = null
  localStorage.removeItem("tof_wallet")

  updateWalletUI()
  renderProfile()

  alert("Logged out")
}



// ===================== PROFILE SYNC =====================
function updateWalletUI() {

  const btn =
    document.querySelector(
      ".card button"
    )

  const editBtn =
    document.getElementById(
      "editAvatarBtn"
    )

  if (!btn) return

  // ================= LOGIN =================
  if (currentWallet) {

    btn.innerText =
      "🌿 LOGOUT DOMPET"

    btn.style.background =
      "#4caf7a"

    btn.onclick =
      logoutWallet

    // tampilkan ikon pensil
    if (editBtn) {
      editBtn.style.visibility =
  "visible"
    }

  }

  // ================= GUEST =================
  else {

    btn.innerText =
      "CONNECT DOMPET"

    btn.style.background =
      ""

    btn.onclick =
      connectWallet

    // sembunyikan ikon pensil
    if (editBtn) {
      editBtn.style.visibility =
  "hidden"
    }
  }
}

// ===================== PROFILE SYNC =====================
async function syncProfile(wallet) {

  const { data, error } =
    await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", wallet)
      .maybeSingle()

  if (error) {
    console.log(error)
    return
  }

  // kalau belum ada user
  if (!data) {

    const {
      data: newUser,
      error: err2
    } =
      await supabaseClient
        .from("profiles")
        .insert([
          {
            id: wallet,
            username:
              "GROWER_" +
              wallet.slice(0, 6),

            xp: 0,
            saldo_tof: 0,
            level: 1,
            avatar_url: ""
          }
        ])
        .select()
        .single()

    if (err2) {
      console.log(err2)
      return
    }

    currentProfile =
      newUser

  } else {

    currentProfile =
      data
  }
}
// ===================== POST =====================

const PILAR_MAP = {
  community: 1,
  inovasi: 2,
  ladang: 3,
  finance: 4,
  refleksi: 5
}

function pilihPilarPopup(text) {
  return new Promise((resolve) => {
    const pilihan = `
Pilih vibe tulisanmu 😎🌿

1️⃣ Komunitas
2️⃣ Inovasi
3️⃣ Ladang
4️⃣ Finance
5️⃣ Refleksi

Ketik 1-5 atau CANCEL 👇
    `

    const input = prompt(pilihan)

    // ✅ FIX 1: CANCEL atau kosong = STOP
    if (!input) {
      resolve(null)
      return
    }

    const map = {
      "1": "community",
      "2": "inovasi",
      "3": "ladang",
      "4": "finance",
      "5": "refleksi"
    }

    resolve(map[input] || null)
  })
}

// Gabungan logika ganda classifyPilar agar tidak tumpang tuntih
async function classifyPilar(text) {
  const t = text.toLowerCase()

  let rekomendasiAwal = "community"

  if (t.includes("modal") || t.includes("profit") || t.includes("aset")) {
    rekomendasiAwal = "finance"
  } else if (t.includes("tanam") || t.includes("ladang") || t.includes("panen")) {
    rekomendasiAwal = "ladang"
  } else if (t.includes("blockchain") || t.includes("wallet")) {
    rekomendasiAwal = "inovasi"
  }

  const userChoice = await pilihPilarPopup(text)

  // ❗ FIX PENTING:
  // kalau user cancel → STOP TOTAL
  if (userChoice === null) {
    return null
  }

  return userChoice || rekomendasiAwal
}

async function sendPost() {
  const input = document.getElementById("postBox")
  const text = input.value.trim()

  if (!currentWallet) {
    alert("Connect wallet dulu")
    return
  }

  if (!text) {
    alert("Isi dulu")
    return
  }

  const pilar = await classifyPilar(text)

// 🚨 FIX FINAL: USER CANCEL = STOP TOTAL
if (!pilar) {
  alert("Post dibatalkan (tidak pilih pilar)")
  return
}

// 🚨 FIX FINAL: validasi mapping
if (!PILAR_MAP[pilar]) {
  alert("Pilar tidak valid, post dibatalkan")
  return
}

const { error } = await supabaseClient
  .from("contributions")
  .insert([
    {
      user_id: currentWallet,
      pilar_aksi: PILAR_MAP[pilar],
      judul_aksi: "Feed Post",
      deskripsi_proses: text,
      status_validasi: "pending"
    }
  ])

if (error) {
  console.log(error)
  alert("Gagal kirim: " + error.message)
  return
}

input.value = ""
loadFeed()
}

// ===================== GLOBAL ECONOMY =====================

async function loadEconomy() {

  // total aset TOF dan ambil XP sekalian untuk kalkulasi statistik rankSummary
  const {
    data: profiles,
    error
  } =
    await supabaseClient
      .from("profiles")
      .select("saldo_tof, xp")

  if (error) {
    console.log(error)
    return
  }

  const total =
    profiles.reduce(
      (sum, user) =>
        sum +
        (Number(user.saldo_tof) || 0),
      0
    )

  // render UI
  const totalAsset =
    document.getElementById(
      "totalAsset"
    )

  const growerEl =
    document.getElementById(
      "rankSummary"
    )

  if (totalAsset) {
    totalAsset.innerText =
      total.toLocaleString() +
      " TOF"
  }
  // 🌿 UPDATE FASE
updateFaseProgress(total)
  if (growerEl) {
    // Memanfaatkan fungsi stats agar tampilan rankSummary menampilkan info lengkap emoji berkategori
    const stats = getRankStats(profiles)
    growerEl.innerHTML = `${profiles.length} ( 🌱${stats.grower} | 🥉${stats.pro} | 🥈${stats.specialist} | 🥇${stats.elite} )`
  }
}
function formatShort(num) {

  if (num >= 1000000) {
    return (
      (num / 1000000)
      .toFixed(1)
      .replace(".0","")
      + "M"
    )
  }

  if (num >= 1000) {
    return (
      (num / 1000)
      .toFixed(1)
      .replace(".0","")
      + "K"
    )
  }

  return num.toString()
}
// =====================
// FASE PROGRESS
// =====================

function updateFaseProgress(totalTof) {

  const faseBar =
    document.getElementById(
      "faseBar"
    )

  const faseText =
    document.getElementById(
      "faseText"
    )

  if (!faseBar || !faseText)
    return

  const fases = [
    {
      name: "FASE 1",
      target: 10000
    },
    {
      name: "FASE 2",
      target: 500000
    },
    {
      name: "FASE 3",
      target: 1000000
    },
    {
      name: "FASE 4",
      target: 3000000
    },
    {
      name: "FASE 5",
      target: 10000000
    },
    {
      name: "FASE 6",
      target: 30000000
    },
    {
      name: "FASE 7",
      target: 100000000
    }
  ]

  let currentPhase =
    fases[0]

  let previousTarget = 0

  for (let i = 0; i < fases.length; i++) {

    if (
      totalTof <=
      fases[i].target
    ) {
      currentPhase =
        fases[i]

      break
    }

    previousTarget =
      fases[i].target
  }

  const progress =
    Math.min(
      (
        (totalTof -
          previousTarget) /
        (
          currentPhase.target -
          previousTarget
        )
      ) * 100,
      100
    )

  faseBar.style.width =
    progress + "%"

  faseText.innerText =
  `${currentPhase.name} • ${Math.floor(progress)}% • ${formatShort(totalTof)} / ${formatShort(currentPhase.target)} TOF`
}
// ===================== FEED =====================
async function loadFeed() {
  const feed = document.getElementById("feed")
  if (!feed) return

  feed.innerHTML = ""

  // ===================== AMBIL POST =====================
  const { data: posts, error: postError } = await supabaseClient
    .from("contributions")
    .select(`
      *,
      profiles:profiles(username, avatar_url)
    `)
    .order("created_at", { ascending: false })

  if (postError || !posts) {
    console.log("POST ERROR:", postError)
    feed.innerHTML = "<div>Gagal load post</div>"
    return
  }

  // ===================== AMBIL COMMENTS (SAFE MODE) =====================
  let comments = []

  try {
    const postIds = posts.map(p => p.id)

    const { data } = await supabaseClient
      .from("comments")
      .select("*")
      .in("post_id", postIds)

    comments = data || []
  } catch (e) {
    console.log("COMMENT ERROR:", e)
    comments = []
  }

  // ===================== GROUP COMMENTS =====================
  const commentMap = {}

  comments.forEach(c => {
    if (!commentMap[c.post_id]) {
      commentMap[c.post_id] = []
    }
    commentMap[c.post_id].push(c)
  })

  // ===================== RENDER =====================
  posts.forEach(item => {

    const div = document.createElement("div")
    div.className = "post"

    const username = item.profiles?.username || "guest"
    const avatar = item.profiles?.avatar_url || "https://via.placeholder.com/40"

    const postComments = commentMap[item.id] || []

    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <img src="${avatar}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;" />
        <div style="font-weight:600;color:#2f6f4e;">@${username}</div>
      </div>

      <div class="text" style="margin-top:6px;">
        ${item.deskripsi_proses}
      </div>

      <div style="margin-top:4px;display:flex;gap:12px;font-size:12px;color:#666;">
        <span onclick="reactPost('${item.id}','sruput')" style="cursor:pointer;">
          ☕ ${item.sruput_count || 0} Sruput
        </span>

        <span onclick="reactPost('${item.id}','cangkul')" style="cursor:pointer;">
          ⛏️ ${item.cangkul_count || 0} Cangkul
        </span>
      </div>

      <div style="margin-top:10px;">
        <input id="comment-${item.id}" placeholder="Tulis komentar..."
          style="width:100%;padding:8px;border-radius:10px;border:1px solid #ddd;font-size:12px;" />

        <button onclick="sendComment('${item.id}')"
          style="margin-top:6px;padding:6px 10px;font-size:12px;">
          Kirim
        </button>
      </div>

      <div style="margin-top:10px;font-size:12px;">
        ${postComments.slice(0, 3).map(c => `
          <div style="padding:3px 0;color:#444;">
            💬 ${c.comment}
          </div>
        `).join("")}
      </div>
    `

    feed.appendChild(div)
  })
}
// ===================== PROFILE RENDER =====================
function renderProfile() {
  const userBox =
    document.getElementById(
      "profileInfo"
    )


  const avatar =
    document.getElementById(
      "profileAvatar"
    )

  if (!userBox) return

  // guest mode
  if (!currentProfile) {

    if (avatar) {
  avatar.style.display =
    "none"
}

    userBox.innerHTML = `
      <div style="
        font-weight:700;
        font-size:16px;
        color:#2f6f4e;
      ">
        @guest
      </div>

      <div style="
        margin-top:12px;
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px;
      ">

        <div class="card"
          style="padding:10px;margin:0;">
          <div style="font-size:11px;color:#888;">
            XP
          </div>
          <div style="font-weight:700;">
            0
          </div>
        </div>

        <div class="card"
          style="padding:10px;margin:0;">
          <div style="font-size:11px;color:#888;">
            TOF
          </div>
          <div style="
            font-weight:700;
            color:#c9a227;
          ">
            0
          </div>
        </div>

      </div>

      <div style="
        margin-top:10px;
        background:#eef7f1;
        border-radius:999px;
        padding:8px 14px;
        display:inline-block;
        color:#2f6f4e;
        font-size:12px;
        font-weight:600;
      ">
        🌱 BELUM LOGIN
      </div>
    `

    return
  }




  if (avatar) {

  avatar.style.display =
    "block"

  avatar.src =
    currentProfile.avatar_url ||
    "https://www.tofarmer.xyz/images/logo-tofarmer.png"
}

  userBox.innerHTML = `
    <div style="
      font-weight:700;
      font-size:16px;
      color:#2f6f4e;
    ">
      @${currentProfile.username}
    </div>

    <div style="
      margin-top:12px;
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:10px;
    ">

      <div class="card"
        style="padding:10px;margin:0;">
        <div style="
          font-size:11px;
          color:#888;
        ">
          XP
        </div>
        <div style="font-weight:700;">
          ${currentProfile.xp || 0}
        </div>
      </div>

      <div class="card"
        style="padding:10px;margin:0;">
        <div style="
          font-size:11px;
          color:#888;
        ">
          TOF
        </div>
        <div style="
          font-weight:700;
          color:#c9a227;
        ">
          ${currentProfile.saldo_tof || 0}
        </div>
      </div>

    </div>

    <div style="
      margin-top:10px;
      background:#eef7f1;
      border-radius:999px;
      padding:8px 14px;
      display:inline-block;
      color:#2f6f4e;
      font-size:12px;
      font-weight:600;
    ">
      🌱 ${getRank(currentProfile.xp || 0)} (Lv ${getTofLevel(currentProfile.xp || 0)})
    </div>
  `
}


// ===================== AVATAR UPLOAD =====================

document.addEventListener("change", async (e) => {
  if (e.target.id !== "avatarInput") return

  if (!currentWallet) {
    alert("Connect wallet dulu 😄")
    return
  }

  const file = e.target.files[0]

  if (!file) return

  const fileName =
    currentWallet + "-" + Date.now()

  // upload ke storage
  const { data: uploadData, error: uploadError } =
  await supabaseClient.storage
    .from("avatars")
    .upload(fileName, file)

if (uploadError) {
  console.log("UPLOAD ERROR:", uploadError)

  alert(
    "Upload gagal: " +
    uploadError.message
  )

  return
}

  // ambil public url
  const { data } =
    supabaseClient.storage
      .from("avatars")
      .getPublicUrl(fileName)

  const avatarUrl = data.publicUrl

  // update profile
  const { error: updateError } =
    await supabaseClient
      .from("profiles")
      .update({
        avatar_url: avatarUrl
      })
      .eq("id", currentWallet)

  if (updateError) {
    console.log(updateError)
    alert("Gagal update profile")
    return
  }

  currentProfile.avatar_url =
    avatarUrl

  renderProfile()
  loadEconomy()

  alert("Foto berhasil diganti 🌿")
})

window.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("tof_wallet")

  if (saved) {
    currentWallet = saved
    syncProfile(saved).then(() => {
      updateWalletUI()
      renderProfile()
    })
  }

  loadFeed()
  loadAvatarStack()
  loadEconomy()
  loadRankSummary()
})

async function loadAvatarStack() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, avatar_url, username")
    .limit(30)

  const container = document.getElementById("avatarStack")
  if (!container || error) return

  container.innerHTML = ""

  data.forEach(user => {
    const img = document.createElement("img")

    img.src =
      user.avatar_url ||
      "https://via.placeholder.com/100"

    img.className = "avatar-item"

    img.title = user.username

    img.onclick = () => {
      alert("Profile: @" + user.username)
    }

    container.appendChild(img)
  })
}

