const currentWallet =
  localStorage.getItem(
    "tof_wallet"
  )

// =====================
// GET USER ID FROM URL
// =====================

const urlParams =
  new URLSearchParams(
    window.location.search
  )

const profileId =
  urlParams.get("id")

// =====================
// RANK SYSTEM
// =====================

function getRank(xp) {

  if (xp >= 33000)
    return "🥇 ELITE"

  if (xp >= 9000)
    return "🥈 SPECIALIST"

  if (xp >= 3000)
    return "🥉 PRO"

  return "🌱 GROWER"
}

function getTofLevel(xp) {

  if (xp >= 33000)
    return 4

  if (xp >= 9000)
    return 3

  if (xp >= 3000)
    return 2

  return 1
}

// =====================
// LOAD PROFILE
// =====================

async function loadProfile() {

  if (!profileId) {

    document
      .getElementById("profile")
      .innerHTML = `
      <div class="card">
        User tidak ditemukan
      </div>
    `

    return
  }

  const { data, error } =
    await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", profileId)
      .single()

  if (error || !data) {

    document
      .getElementById("profile")
      .innerHTML = `
      <div class="card">
        Profile tidak ditemukan
      </div>
    `

    return
  }

  document
    .getElementById("profile")
    .innerHTML = `

    <div class="card"
      style="
        text-align:center;
      "
    >

      <img
        src="${
          data.avatar_url ||
          'https://www.tofarmer.xyz/images/logo-tofarmer.png'
        }"
        style="
          width:110px;
          height:110px;
          border-radius:50%;
          object-fit:cover;
          border:4px solid rgba(76,175,122,.18);
          box-shadow:0 8px 20px rgba(0,0,0,.08);
        "
      >

      <h2
        style="
          margin-top:14px;
          color:#2f6f4e;
        "
      >
        @${data.username}
      </h2>

      <div
        style="
          display:grid;
          grid-template-columns:
            1fr 1fr;
          gap:12px;
          margin-top:16px;
        "
      >

        <div class="card"
          style="
            margin:0;
            padding:12px;
          "
        >
          <div
            style="
              font-size:11px;
              color:#888;
            "
          >
            XP
          </div>

          <div
            style="
              font-weight:700;
            "
          >
            ${data.xp || 0}
          </div>
        </div>

        <div class="card"
          style="
            margin:0;
            padding:12px;
          "
        >
          <div
            style="
              font-size:11px;
              color:#888;
            "
          >
            TOF
          </div>

          <div
            style="
              color:#c9a227;
              font-weight:700;
            "
          >
            ${data.saldo_tof || 0}
          </div>
        </div>

      </div>

      <div
        style="
          margin-top:14px;
          background:#eef7f1;
          border-radius:999px;
          padding:8px 14px;
          display:inline-block;
          color:#2f6f4e;
          font-size:12px;
          font-weight:600;
        "
      >
        ${getRank(data.xp || 0)}
        •
        Lv
        ${getTofLevel(data.xp || 0)}
      </div>

    </div>
  `

renderWorkspace()
loadUserPosts()
}
loadProfile()

// =====================
// WORKSPACE
// =====================

function renderWorkspace() {

  const box =
    document.getElementById(
      "profileWorkspace"
    )

  // cuma profil sendiri
  if (
    currentWallet !==
    profileId
  ) {
    box.innerHTML = ""
    return
  }

  box.innerHTML = `

    <div class="card">

      <div style="
        font-weight:700;
        color:#2f6f4e;
        margin-bottom:12px;
      ">
        🌿 Ruang Karya Saya
      </div>

      <textarea
        id="profilePostBox"
        placeholder="
Apa ide, eksperimen, atau progres hari ini? ✨
"
        style="
          width:100%;
          min-height:160px;
          padding:16px;
          border-radius:18px;
          border:2px solid rgba(76,175,122,.12);
          resize:none;
          outline:none;
          font-family:inherit;
        "
      ></textarea>

      <button class="btn-glow" onclick="sendProfilePost()">
  🌱 TANAM KARYA
</button>

    </div>
  `
}

// =====================
// SEND PROFILE POST
// =====================

async function sendProfilePost() {

  const input =
    document.getElementById(
      "profilePostBox"
    )

  const text =
    input.value.trim()

  if (!text) {
    alert("Isi dulu 😄")
    return
  }

  const { error } =
    await supabaseClient
      .from("contributions")
      .insert([{
        user_id:
          currentWallet,

        pilar_aksi: 1,

        judul_aksi:
          "Profile Post",

        deskripsi_proses:
          text,

        status_validasi:
          "pending"
      }])

  if (error) {
    console.log(error)
    alert("Gagal kirim")
    return
  }

  input.value = ""

  alert("🌿 Karya ditanam")

  loadUserPosts()
}

// =====================
// USER POSTS
// =====================

async function loadUserPosts() {

  const box =
    document.getElementById(
      "userPosts"
    )

  const { data } =
    await supabaseClient
      .from("contributions")
      .select("*")
      .eq(
        "user_id",
        profileId
      )
      .order(
        "created_at",
        {
          ascending:false
        }
      )

  if (!data?.length) {

    box.innerHTML = `
      <div class="card"
        style="
          text-align:center;
          color:#888;
        "
      >
        Belum ada karya 🌱
      </div>
    `

    return
  }

  box.innerHTML =
    data.map(post => `

      <div class="card"
        style="
          margin-bottom:12px;
        "
      >

        <div style="
          font-size:13px;
          line-height:1.7;
        ">
          ${post.deskripsi_proses}
        </div>

      </div>

    `).join("")
}
