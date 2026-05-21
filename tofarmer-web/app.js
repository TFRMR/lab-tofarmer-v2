function getRank(xp) {
  if (xp >= 33000) return "ELITE";
  if (xp >= 9000) return "SPECIALIST";
  if (xp >= 3000) return "PRO";
  return "GROWER";
}

// Menghindari ReferenceError pada renderProfile
function getTofLevel(xp) {
  if (xp >= 33000) return 4;
  if (xp >= 9000) return 3;
  if (xp >= 3000) return 2;
  return 1;
}

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

1️⃣ Komunitas & Kreativitas (rame-rame, ngobrol, ide liar)
2️⃣ Inovasi & Teknologi (AI, blockchain, masa depan)
3️⃣ Ladang & Alam (tanah, kopi, panen, hujan romantis)
4️⃣ Keuangan & Ekonomi (duit, TOF, strategi cuan)
5️⃣ Refleksi & Kesadaran (renungan sambil ngopi ☕)

Ketik angka 1-5 ya bos 👇
    `

    let input = prompt(pilihan)

    let map = {
      "1": "community",
      "2": "inovasi",
      "3": "ladang",
      "4": "finance",
      "5": "refleksi"
    }

    resolve(map[input] || null) // Biarkan null jika tidak valid agar bisa difallback ke hasil rekomendasi heuristic
  })
}

// Gabungan logika ganda classifyPilar agar tidak tumpang tindih
async function classifyPilar(text) {
  // 🧠 Logika Heuristic / Rule Sederhana (Prediksi awal)
  const t = text.toLowerCase()
  let rekomendasiAwal = "community"

  if (t.includes("modal") || t.includes("profit") || t.includes("aset")) {
    rekomendasiAwal = "finance"
  } else if (t.includes("tanam") || t.includes("ladang") || t.includes("panen")) {
    rekomendasiAwal = "ladang"
  } else if (t.includes("blockchain") || t.includes("wallet") || t.includes("smart contract")) {
    rekomendasiAwal = "inovasi" // disesuaikan dengan key PILAR_MAP
  }

  // 🌿 Konfirmasi/Pilihan utama lewat popup user (lebih akurat 😄)
  const userChoice = await pilihPilarPopup(text)

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

  const { error } = await supabaseClient
    .from("contributions")
    .insert([
      {
        user_id: currentWallet,
        pilar_aksi: PILAR_MAP[pilar], // 🔥 INI WAJIB ANGKA
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

  if (growerEl) {
    // Memanfaatkan fungsi stats agar tampilan rankSummary menampilkan info lengkap emoji berkategori
    const stats = getRankStats(profiles)
    growerEl.innerHTML = `${profiles.length} ( 🌱${stats.grower} | 🥉${stats.pro} | 🥈${stats.specialist} | 🥇${stats.elite} )`
  }
}


// ===================== FEED =====================
async function loadFeed() {
  const { data, error } = await supabaseClient
    .from("contributions")
    .select("*")
    .order("created_at", { ascending: false })

  const feed = document.getElementById("feed")
  if (!feed || error) return

  feed.innerHTML = ""

  data.forEach(item => {
    const div = document.createElement("div")
    div.className = "post"

    div.innerHTML = `
      <div class="user">@${item.user_id}</div>
      <div class="text">${item.deskripsi_proses}</div>
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

// ===================== RANK UTILITIES & SUMMARY =====================

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

async function loadRankSummary() {
  const { data } = await supabaseClient
    .from("profiles")
    .select("xp")

  if (!data) return

  const stats = getRankStats(data)

  const growerCountEl = document.getElementById("growerCount")
  if (growerCountEl) {
    growerCountEl.innerHTML = `${data.length} (🌱${stats.grower} | 🥉${stats.pro} | 🥈${stats.specialist} | 🥇${stats.elite})`
  }
}