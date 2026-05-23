const currentWallet = localStorage.getItem("tof_wallet")

// =====================
// TOF LIVE CONFIG
// =====================

const TOF_ASSET_ID = 3558306283
const ALGONODE_URL =
  "https://mainnet-api.algonode.cloud"

// =====================
// GET WALLET TOF BALANCE
// =====================

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

// =====================
// GET USER ID FROM URL
// =====================

const urlParams = new URLSearchParams(window.location.search)
const profileId = urlParams.get("id")

// =====================
// RANK SYSTEM
// =====================

function getRank(xp) {
  if (xp >= 33000) return "🥇 ELITE"
  if (xp >= 9000) return "🥈 SPECIALIST"
  if (xp >= 3000) return "🥉 PRO"
  return "🌱 GROWER"
}

function getTofLevel(xp) {
  if (xp >= 33000) return 4
  if (xp >= 9000) return 3
  if (xp >= 3000) return 2
  return 1
}

// =====================
// LOAD PROFILE
// =====================

async function refreshBalance(profileId) {
  const bal = await getWalletTofBalance(profileId)

  await supabaseClient
    .from("profiles")
    .update({
      saldo_tof: bal
    })
    .eq("id", profileId)

  return bal
}

// =====================
// LOAD PROFILE
// =====================

async function loadProfile() {

  if (!profileId) {
    document.getElementById("profile").innerHTML = `
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
    document.getElementById("profile").innerHTML = `
      <div class="card">
        Profile tidak ditemukan
      </div>
    `
    console.log(error)
    return
  }

  renderProfileData(data)
  renderWorkspace()
  loadUserPosts()

  try {
    const liveBalance =
      await getWalletTofBalance(profileId)

    data.saldo_tof = liveBalance

    renderProfileData(data)

    await supabaseClient
      .from("profiles")
      .update({
        saldo_tof: liveBalance
      })
      .eq("id", profileId)

  } catch (err) {
    console.log("LIVE BALANCE ERROR:", err)
  }
}

loadProfile()

// =====================
// PROFILE RENDER
// =====================

function renderProfileData(data) {

  document.getElementById("profile").innerHTML = `
    <div class="card" style="text-align:center;">

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

      <h2 style="margin-top:14px;color:#2f6f4e;">
        @${data.username}
      </h2>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;">

        <div class="card" style="margin:0;padding:12px;">
          <div style="font-size:11px;color:#888;">XP</div>
          <div style="font-weight:700;">${data.xp || 0}</div>
        </div>

        <div class="card" style="margin:0;padding:12px;">
          <div style="font-size:11px;color:#888;">TOF</div>
          <div id="profileTof" style="color:#c9a227;font-weight:700;">
            ${data.saldo_tof || 0}
          </div>
        </div>

      </div>

      <div style="
        margin-top:14px;
        background:#eef7f1;
        border-radius:999px;
        padding:8px 14px;
        display:inline-block;
        color:#2f6f4e;
        font-size:12px;
        font-weight:600;
      ">
        ${getRank(data.xp || 0)}
        • Level ${getTofLevel(data.xp || 0)}
      </div>

    </div>
  `
}

// =====================
// WORKSPACE (FIXED - FULL UI DIGABUNG, TIDAK DIHAPUS)
// =====================

function renderWorkspace() {
  const box = document.getElementById("profileWorkspace")

  if (!box) return

  if (currentWallet !== profileId) {
    box.innerHTML = ""
    return
  }

  box.innerHTML = `
    <div class="card">

   

 <!-- QRIS BUTTON -->
        <button class="btn-glow" onclick="openQrisPopup()" style="
          padding: 6px 12px; 
          font-size: 10px; 
          width: auto; 
          margin: 15px; 
          background: gold;
          color: #000;
          border: none
          border-radius: 8px;
        ">
          💰 Nabung Ladang (QRIS)
        </button>
 
   <div style="font-weight:700;color:#2f6f4e;margin-bottom:5px;">
        🌿 Ruang Karya Saya
      </div>

   <textarea
  id="profilePostBox"
  placeholder="Apa ide, progres, atau eksperimen hari ini?"
  style="width:100%;min-height:100px;padding:14px;border-radius:16px;border:2px solid rgba(76,175,122,.12);resize:none;outline:none;"
></textarea>

<input
  type="file"
  id="profileImage"
  accept="image/*"
  style="
    width:100%;
    margin-top:10px;
    margin-bottom:10px;
    font-size:12px;
  "
/>

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
    document.getElementById("profilePostBox")

  const imageInput =
    document.getElementById("profileImage")

  const text =
    input.value.trim()

  const file =
    imageInput.files[0]

  if (!text && !file) {
    return alert("Isi teks atau pilih gambar 😄")
  }

  let imageUrl = null

  // =====================
  // UPLOAD IMAGE
  // =====================

  if (file) {

    const fileName =
      `${Date.now()}-${file.name}`

    const { error: uploadError } =
      await supabaseClient.storage
        .from("profile-posts")
        .upload(fileName, file)

    if (uploadError) {
      console.log(uploadError)
      return alert("Upload gambar gagal")
    }

    const { data } =
      supabaseClient.storage
        .from("profile-posts")
        .getPublicUrl(fileName)

    imageUrl = data.publicUrl
  }

  // =====================
  // INSERT POST
  // =====================

  const { error } =
    await supabaseClient
      .from("contributions")
      .insert([{
        user_id: currentWallet,
        judul_aksi: "Profile Post",
        deskripsi_proses: text,
        image_url: imageUrl,
        status_validasi: "pending",
        is_private: true
      }])

  if (error) {
    console.log(error)
    return alert("Gagal kirim")
  }

  input.value = ""
  imageInput.value = ""

  alert("🌿 Karya ditanam")

  loadUserPosts()
}

// =====================
// USER POSTS
// =====================

async function loadUserPosts() {
  const box = document.getElementById("userPosts")

  const { data } = await supabaseClient
    .from("contributions")
    .select("*")
    .eq("user_id", profileId)
    .eq("is_private", true)
    .order("created_at", { ascending: false })

  if (!data?.length) {
    box.innerHTML = `<div class="card" style="text-align:center;color:#888;">Belum ada karya 🌱</div>`
    return
  }

  box.innerHTML = data.map(post => {
    const date = new Date(post.created_at).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })

    return `
      <div class="card">

        <div style="font-size:11px;color:#6f7f76;margin-bottom:6px;">
          🌿 ${date}
        </div>

       <div style="font-size:13px;line-height:1.7;margin-bottom:10px;">
  ${post.deskripsi_proses || ""}
</div>

${
  post.image_url
    ? `
      <div style="
        width:100%;
        display:flex;
        justify-content:center;
        margin-bottom:12px;
      ">

        <img
          src="${post.image_url}"
          style="
            max-width:100%;
            max-height:420px;
            width:auto;
            height:auto;
            object-fit:contain;
            border-radius:16px;
            border:1px solid rgba(0,0,0,.06);
            box-shadow:0 4px 12px rgba(0,0,0,.08);
          "
        />

      </div>
    `
    : ""
}

        <div style="display:flex;gap:14px;font-size:12px;color:#666;margin-bottom:10px;">
          <span onclick="reactPost('${post.id}','sruput')">
            ☕ ${post.sruput_count || 0}
          </span>

          <span onclick="reactPost('${post.id}','cangkul')">
            ⛏️ ${post.cangkul_count || 0}
          </span>
        </div>

        <input id="cmt-${post.id}" placeholder="Tulis komentar..." style="width:100%;padding:8px;border-radius:10px;border:1px solid #ddd;font-size:12px;" />

        <button class="btn-glow" onclick="sendComment('${post.id}')">Kirim</button>

        <div id="commentBox-${post.id}" style="margin-top:8px;font-size:12px;color:#444;"></div>

      </div>
    `
  }).join("")

  setTimeout(() => data.forEach(p => loadComments(p.id)), 0)
}

// =====================
// REACTION
// =====================

let reacting = false

async function reactPost(postId, type) {
  if (reacting) return
  reacting = true

  const { data: post } = await supabaseClient
    .from("contributions")
    .select("*")
    .eq("id", postId)
    .single()

  if (post.user_id === currentWallet) return alert("Tidak bisa reaction sendiri 😄")

  const { data: existing } = await supabaseClient
    .from("reactions")
    .select("*")
    .eq("post_id", postId)
    .eq("user_id", currentWallet)
    .maybeSingle()

  if (!existing) {
    await supabaseClient.from("reactions").insert([{ post_id: postId, user_id: currentWallet, type }])
  }

  await supabaseClient
    .from("contributions")
    .update({
      [type === "sruput" ? "sruput_count" : "cangkul_count"]:
        (post[type === "sruput" ? "sruput_count" : "cangkul_count"] || 0) + 1
    })
    .eq("id", postId)

  reacting = false
  loadUserPosts()
}

// =====================
// COMMENTS
// =====================

async function sendComment(postId) {
  const input = document.getElementById("cmt-" + postId)
  const text = input.value.trim()

  if (!text) return

  await supabaseClient.from("comments").insert([{
    post_id: postId,
    user_id: currentWallet,
    comment: text
  }])

  input.value = ""
  loadComments(postId)
}

async function loadComments(postId) {
  const { data } = await supabaseClient
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: false })

  const box = document.getElementById("commentBox-" + postId)
  if (!box) return

  box.innerHTML = (data || []).map(c => `💬 ${c.comment}`).join("")
}

// =====================
// REALTIME SYNC
// =====================

setInterval(async () => {
  if (!profileId) return

  const liveBalance = await getWalletTofBalance(profileId)

  const tofEl = document.querySelector("#profileTof")

  if (tofEl) tofEl.innerText = liveBalance

}, 10000)

// =====================
// QRIS POPUP (FIXED IMG TAG ONLY)
// =====================

function openQrisPopup() {

  const modal = document.createElement("div")

  modal.innerHTML = `
  <div style="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;justify-content:center;align-items:center;z-index:99999;">

    <div style="background:white;padding:20px;border-radius:16px;width:300px;text-align:center;">

      <div style="font-size:20px;font-weight:700;">💰 QRIS Nabung</div>

      <img src="https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEj1GZ5Yj2ap3EK89tCn3WARaMg3tpFimb5PJBCgba4tiyldTScOozTShs-C0w-lTrtYu-RfsyP7Ci2736t02jVayLvmTclX-KfBy0RTmeCaulJtc3wVQTzfz8l62Fnv8ORGW3lUQB_Gc82V_2syjt7eIb4Q7Cg5yvCxYwDL9Or0_FDKr7ixRyDP8pkeriU/s320/WhatsApp%20Image%202026-05-23%20at%2002.36.28.jpeg" />

      <p style="font-size:12px;color:#666;">Transfer manual lalu klik konfirmasi</p>

       <button class="btn-glow" onclick="submitQrisPayment()">✅ Saya Sudah Transfer</button>
       <button class="btn-glow" onclick="this.parentElement.parentElement.remove()">❌ Tutup</button>

    </div>
  </div>
  `

  document.body.appendChild(modal)
}

// =====================
// PAYMENT
// =====================

async function submitQrisPayment() {
  const xpReward = 50

  await supabaseClient.from("payments").insert([{
    user_id: currentWallet,
    amount: 0,
    method: "qris",
    status: "pending",
    xp_reward: xpReward
  }])

  alert("🌿 Menunggu konfirmasi admin")
}

async function approvePayment(paymentId, userId, xp) {

  await supabaseClient.from("payments").update({ status: "confirmed" }).eq("id", paymentId)

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("xp")
    .eq("id", userId)
    .single()

  await supabaseClient.from("profiles").update({
    xp: (profile.xp || 0) + xp
  }).eq("id", userId)
}