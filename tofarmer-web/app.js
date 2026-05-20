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

  alert("Wallet connected: " + wallet)
}

function logoutWallet() {
  currentWallet = null
  currentProfile = null
  localStorage.removeItem("tof_wallet")

  updateWalletUI()
  renderProfile()

  alert("Logged out")
}

// ===================== UI WALLET =====================
function updateWalletUI() {
  const btn = document.querySelector("button[onclick='connectWallet()']")
  if (!btn) return

  if (currentWallet) {
    btn.innerText = "🔗 WALLET CONNECTED (LOGOUT)"
    btn.style.background = "#4caf7a"
    btn.onclick = logoutWallet
  } else {
    btn.innerText = "CONNECT ALGORAND"
    btn.style.background = ""
    btn.onclick = connectWallet
  }
}

// ===================== PROFILE SYNC =====================
async function syncProfile(wallet) {
  const { data, error } = await supabaseClient
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
    const { data: newUser, error: err2 } = await supabaseClient
      .from("profiles")
      .insert([
        {
          id: wallet,
          username: "GROWER_" + wallet.slice(0, 6),
          xp: 0,
          saldo_tof: 0,
          rank: "NOVICE",
          level: 1
        }
      ])
      .select()
      .single()

    if (err2) {
      console.log(err2)
      return
    }

    currentProfile = newUser
  } else {
    currentProfile = data
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

    resolve(map[input] || "community")
  })
}

async function classifyPilar(text) {
  // sementara: pakai pilihan user dulu (lebih akurat 😄)
  const result = await pilihPilarPopup(text)

  return result
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





async function classifyPilar(text) {
  // 🧠 placeholder AI (nanti bisa diganti OpenAI / HuggingFace)
  
  // sementara: rule sederhana (heuristic ringan)
  const t = text.toLowerCase()

  if (t.includes("modal") || t.includes("profit") || t.includes("aset")) {
    return "finance"
  }

  if (t.includes("tanam") || t.includes("ladang") || t.includes("panen")) {
    return "ladang"
  }

  if (t.includes("blockchain") || t.includes("wallet") || t.includes("smart contract")) {
    return "blockchain"
  }

  // default fallback
  return "community"
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
  const userBox = document.getElementById("userBox")
  if (!userBox || !currentProfile) return

  userBox.innerHTML = `
    <div>@${currentProfile.username}</div>
    <div>XP: ${currentProfile.xp}</div>
    <div>TOF: ${currentProfile.saldo_tof}</div>
    <div>RANK: ${currentProfile.rank}</div>
  `
}

// ===================== INIT =====================
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
})