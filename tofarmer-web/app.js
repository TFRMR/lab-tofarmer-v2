

let currentWallet = null
let currentProfile = null



// ===================== WALLET =====================
async function connectWallet() {
  return new Promise((resolve) => {

    const modal = document.createElement("div")

    modal.innerHTML = `
    <div style="
      position:fixed;
      inset:0;
      background:rgba(16,25,20,.6);
      backdrop-filter:blur(10px);
      display:flex;
      justify-content:center;
      align-items:center;
      z-index:99999;
      padding:20px;
    ">

    <div style="
      width:100%;
      max-width:420px;
      background:linear-gradient(180deg,#ffffff,#f3f8f4);
      border-radius:26px;
      padding:24px;
      box-shadow:0 20px 60px rgba(47,111,78,.25);
      border:1px solid rgba(76,175,122,.15);
      text-align:center;
    ">

      <div style="font-size:50px;">🌿☕</div>

      <h2 style="
        color:#2f6f4e;
        margin-top:10px;
      ">
        Masuk ke Ladang Digital
      </h2>

      <p style="
        color:#6f7f76;
        font-size:13px;
        margin:10px 0 20px;
      ">
        Sambungkan wallet kamu untuk mulai menanam ide di ekosistem ToFarmer
      </p>

      <input id="walletInput"
        placeholder="Masukkan wallet Algorand..."
        style="
          width:100%;
          padding:12px;
          border-radius:12px;
          border:1px solid #ddd;
          margin-bottom:15px;
          outline:none;
        "
      />

      <button id="connectBtn" style="
        width:100%;
        padding:12px;
        border:none;
        border-radius:14px;
        background:linear-gradient(90deg,#4caf7a,#c9a227);
        color:white;
        font-weight:bold;
        cursor:pointer;
      ">
        🌱 Masuk Ladang
      </button>

      <button id="cancelBtn" style="
        width:100%;
        margin-top:10px;
        padding:10px;
        border:none;
        border-radius:14px;
        background:#eef4ef;
        color:#6f7f76;
        font-weight:600;
        cursor:pointer;
      ">
        Batal (kambing dulu 🐐)
      </button>

    </div>
    </div>
    `

    document.body.appendChild(modal)

    const input = modal.querySelector("#walletInput")
    const connectBtn = modal.querySelector("#connectBtn")
    const cancelBtn = modal.querySelector("#cancelBtn")

    // CONNECT
    connectBtn.onclick = async () => {
      const wallet = input.value.trim()

      if (!wallet) {
        alert("Isi wallet dulu ya petani 🌿")
        return
      }

      document.body.removeChild(modal)

      currentWallet = wallet
      localStorage.setItem("tof_wallet", wallet)

      await syncProfile(wallet)

      updateWalletUI()
      renderProfile()

      alert("🌿 Selamat datang di ladang ToFarmer!")
      resolve(wallet)
    }

    // CANCEL
    cancelBtn.onclick = () => {
      document.body.removeChild(modal)
      resolve(null)
    }
  })
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

    const modal = document.createElement("div")

    modal.innerHTML = `
    <div style="
      position:fixed;
      inset:0;
      background:rgba(16,25,20,.55);
      backdrop-filter:blur(10px);
      display:flex;
      justify-content:center;
      align-items:center;
      z-index:99999;
      padding:20px;
    ">

    <div style="
      width:100%;
      max-width:430px;
      background:linear-gradient(180deg,#fff,#f3f8f4);
      border-radius:28px;
      padding:26px;
      box-shadow:0 20px 60px rgba(47,111,78,.18);
      border:1px solid rgba(76,175,122,.12);
    ">

      <div style="text-align:center;">
        <div style="font-size:50px;">☕🌿</div>

        <h2 style="color:#2f6f4e;">
          Mau ditanam di ladang mana?
        </h2>

        <p style="color:#6f7f76;font-size:13px;">
          Pilih vibe postinganmu dulu ya petani digital 😎
        </p>
      </div>

      <div style="display:grid;gap:10px;margin-top:20px;">

  <button class="pilar-btn" data-p="community">
    🤝 Titik Kumpul
    <small>Ngopi, ide, ngobrol, santai, dan rame-rame nanam gagasan</small>
  </button>

  <button class="pilar-btn" data-p="inovasi">
    🤖 Ladang Eksperimen
    <small>AI, blockchain, robot, dan ide yang kadang “nggak masuk akal tapi jadi”</small>
  </button>

  <button class="pilar-btn" data-p="ladang">
    🌱 Cerita Tanah & Panen
    <small>Dari pupuk, hujan, sampai drama ayam masuk kebun</small>
  </button>

  <button class="pilar-btn" data-p="finance">
    ☕ Mesin Kopi Modal
    <small>TOF, aset, strategi hidup biar ladang tetap jalan</small>
  </button>

  <button class="pilar-btn" data-p="refleksi">
    🔥 Mode Petapa Gunung
    <small>Renungan, kabut pagi, dan pikiran random yang ternyata dalam</small>
  </button>

</div>

      <button id="cancelPilar" style="
        width:100%;
        margin-top:16px;
        padding:12px;
        border:none;
        border-radius:16px;
        background:#eef4ef;
        color:#6f7f76;
        font-weight:600;
      ">
        🐐 batal, kambing panen dulu
      </button>

    </div>
    </div>
    `

    document.body.appendChild(modal)

    // tombol klik pilihan
    modal.querySelectorAll(".pilar-btn").forEach(btn => {
      btn.onclick = () => {
        const value = btn.dataset.p
        document.body.removeChild(modal)
        resolve(value)
      }
    })

    // cancel
    modal.querySelector("#cancelPilar").onclick = () => {
      document.body.removeChild(modal)
      resolve(null)
    }
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
  const imageInput = document.getElementById("imageInput")

  const text = input.value.trim()
  const file = imageInput.files[0]

  if (!currentWallet) {
    alert("Connect wallet dulu")
    return
  }

  if (!text && !file) {
    alert("Isi teks atau gambar dulu")
    return
  }

  const pilar = await classifyPilar(text)

  if (!pilar) {
    alert("Post dibatalkan")
    return
  }

  if (!PILAR_MAP[pilar]) {
    alert("Pilar tidak valid")
    return
  }

  let imageUrl = null

  // ================= UPLOAD GAMBAR =================
  if (file) {
    const fileName = currentWallet + "-" + Date.now()

    const { error: uploadError } = await supabaseClient
      .storage
      .from("post-images")
      .upload(fileName, file)

    if (uploadError) {
      console.log(uploadError)
      alert("Upload gambar gagal")
      return
    }

    const { data } = supabaseClient
      .storage
      .from("post-images")
      .getPublicUrl(fileName)

    imageUrl = data.publicUrl
  }

  // ================= SIMPAN POST =================
  const { error } = await supabaseClient
    .from("contributions")
    .insert([
      {
        user_id: currentWallet,
        pilar_aksi: PILAR_MAP[pilar],
        judul_aksi: "Feed Post",
        deskripsi_proses: text,
        image_url: imageUrl,
        status_validasi: "pending"
      }
    ])

  if (error) {
    console.log(error)
    alert("Gagal kirim: " + error.message)
    return
  }

  input.value = ""
  imageInput.value = ""

  loadFeed()
}

// ===================== GLOBAL ECONOMY (SAFE LIVE) =====================
// ===================== GLOBAL CONFIG =====================

const TOF_ASSET_ID = 3558306283
const ALGONODE_URL =
  "https://mainnet-api.algonode.cloud"

// ===================== WALLET BALANCE =====================

async function getWalletTofBalance(wallet) {
  try {
    if (!wallet) return 0

    const res = await fetch(
      `${ALGONODE_URL}/v2/accounts/${wallet}`
    )

    if (!res.ok) return 0

    const account = await res.json()

    const asset = account.assets?.find(
      a =>
        Number(a["asset-id"]) === TOF_ASSET_ID
    )

    return asset
      ? Number(asset.amount) / 1000000
      : 0

  } catch (err) {
    console.log("Wallet fetch gagal:", wallet)
    return 0
  }
}

// ===================== ECONOMY =====================

async function loadEconomy() {

  try {

    const { data: profiles, error } =
      await supabaseClient
        .from("profiles")
        .select("id, xp")

    if (error || !profiles) {
      console.log(error)
      return
    }

    const totalAsset =
      document.getElementById("totalAsset")

    if (totalAsset) {
      totalAsset.innerText = "Sync..."
    }

    // =====================
    // HITUNG TOTAL LIVE
    // =====================

    let total = 0
    const batchSize = 5

    for (let i = 0; i < profiles.length; i += batchSize) {

      const batch = profiles.slice(i, i + batchSize)

      const balances = await Promise.all(
        batch.map(user =>
          getWalletTofBalance(user.id)
        )
      )

      total += balances.reduce(
        (sum, bal) => sum + bal,
        0
      )
    }

    const totalFixed = Number(total) || 0

    console.log("TOTAL BLOCKCHAIN:", totalFixed)

    if (totalAsset) {
      totalAsset.innerText =
        totalFixed.toLocaleString("id-ID", {
          maximumFractionDigits: 2
        }) + " TOF"
    }

    // =====================
    // UPDATE FASE PROGRESS
    // =====================

    setTimeout(() => {
      updateFaseProgress(totalFixed)
    }, 100)

    // =====================
    // AVATAR STACK
    // =====================

    loadAvatarStack()

    // =====================
    // RANK SUMMARY (optional)
    // =====================

    const growerEl =
      document.getElementById("rankSummary")

    if (growerEl && typeof getRankStats === "function") {
      const stats = getRankStats(profiles)

      growerEl.innerHTML =
        `${profiles.length}
        ( 🌱${stats.grower}
        | 🥉${stats.pro}
        | 🥈${stats.specialist}
        | 🥇${stats.elite} )`
    }

  } catch (err) {
    console.log("ECONOMY ERROR:", err)
  }
}

// ===================== FORMAT NUMBER =====================

function formatShort(num) {

  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(".0","") + "M"
  }

  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(".0","") + "K"
  }

  return num.toString()
}

// ===================== FASE PROGRESS =====================

function updateFaseProgress(totalTof) {

  const faseBar = document.getElementById("faseBar")
  const faseText = document.getElementById("faseText")

  if (!faseBar || !faseText) {
    console.log("❌ faseBar / faseText tidak ditemukan")
    return
  }

  totalTof = Number(totalTof) || 0

  const fases = [
    { name: "FASE 1", target: 10000 },
    { name: "FASE 2", target: 500000 },
    { name: "FASE 3", target: 1000000 },
    { name: "FASE 4", target: 3000000 },
    { name: "FASE 5", target: 10000000 },
    { name: "FASE 6", target: 30000000 },
    { name: "FASE 7", target: 100000000 }
  ]

  let currentPhase = fases[0]
  let previousTarget = 0

  for (let i = 0; i < fases.length; i++) {
    if (totalTof <= fases[i].target) {
      currentPhase = fases[i]
      break
    }
    previousTarget = fases[i].target
  }

  const range = currentPhase.target - previousTarget

  let progress = range > 0
    ? ((totalTof - previousTarget) / range) * 100
    : 100

  progress = Math.max(0, Math.min(progress, 100))

  faseBar.style.width = progress + "%"

  const sisa = Math.max(0, currentPhase.target - totalTof)

  faseText.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:#2f6f4e;">
      🌿 ${currentPhase.name}
    </div>

    <div style="font-size:10px;color:#6f7f76;margin-top:2px;">
      ${Math.floor(progress)}% progress
    </div>

    <div style="font-size:10px;color:#b5942b;margin-top:2px;">
      ${formatShort(totalTof)} / ${formatShort(currentPhase.target)} TOF
    </div>

    <div style="font-size:10px;color:#999;margin-top:2px;">
      Sisa ${formatShort(sisa)} TOF
    </div>
  `
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
.eq("is_private", false)
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
const date = new Date(item.created_at).toLocaleString("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});
    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <img src="${avatar}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;" />
        <div style="font-weight:600;color:#2f6f4e;">@${username}</div>
      </div>

     <div style="font-size:11px;color:#6f7f76;margin-bottom:6px;">
  			 ${date}
</div>

<div class="text" style="margin-top:6px;">
  ${item.deskripsi_proses || ""}
</div>

${item.image_url ? `
  <div style="margin-top:10px;">
    <img
      src="${item.image_url}"
      style="
        width:50%;
        max-height:200px;
        object-fit:cover;
        border-radius:14px;
        border:1px solid rgba(0,0,0,0.08);
        box-shadow:0 4px 14px rgba(0,0,0,0.06);
      "
    />
  </div>
` : ""}
    
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

  window.location.href =
    `profile.html?id=${user.id}`

}

    container.appendChild(img)
  })
}

