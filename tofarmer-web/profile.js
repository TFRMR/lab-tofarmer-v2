const currentWallet = localStorage.getItem("tof_wallet")

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
async function loadProfile() {
  if (!profileId) {
    document.getElementById("profile").innerHTML = `
      <div class="card">
        User tidak ditemukan
      </div>
    `
    return
  }

  const { data, error } = await supabaseClient
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
    return
  }

  document.getElementById("profile").innerHTML = `
    <div class="card" style="text-align:center;">
      <img
        src="${data.avatar_url || 'https://www.tofarmer.xyz/images/logo-tofarmer.png'}"
        style="
          width:110px;
          height:110px;
          border-radius:50%;
          object-fit:cover;
          border:4px solid rgba(76,175,122,.18);
          box-shadow:0 8px 20px rgba(0,0,0,.08);
        "
      >

      <h2 style="margin-top:14px; color:#2f6f4e;">
        @${data.username}
      </h2>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:16px;">
        <div class="card" style="margin:0; padding:12px;">
          <div style="font-size:11px; color:#888;">
            XP
          </div>
          <div style="font-weight:700;">
            ${data.xp || 0}
          </div>
        </div>

        <div class="card" style="margin:0; padding:12px;">
          <div style="font-size:11px; color:#888;">
            TOF
          </div>
          <div style="color:#c9a227; font-weight:700;">
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
        ${getRank(data.xp || 0)} • Level ${getTofLevel(data.xp || 0)}
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
  const box = document.getElementById("profileWorkspace")

  // cuma profil sendiri
  if (currentWallet !== profileId) {
    box.innerHTML = ""
    return
  }

  box.innerHTML = `
    <div class="card">
      <div style="font-weight:700; color:#2f6f4e; margin-bottom:12px;">
        🌿 Ruang Karya Saya
      </div>

      <textarea
        id="profilePostBox"
        placeholder="Apa ide, eksperimen, atau progres hari ini? ✨"
        style="
          width:95%;
          min-height:100px;
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
  const input = document.getElementById("profilePostBox")
  const text = input.value.trim()

  if (!text) {
    alert("Isi dulu 😄")
    return
  }

  const { error } = await supabaseClient
    .from("contributions")
    .insert([{
      user_id: currentWallet,
      judul_aksi: "Profile Post",
      deskripsi_proses: text,
      status_validasi: "pending",
      is_private: true
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
  const box = document.getElementById("userPosts")

  const { data } = await supabaseClient
    .from("contributions")
    .select("*")
    .eq("user_id", profileId)
    .eq("is_private", true)
    .order("created_at", { ascending: false })

  if (!data?.length) {
    box.innerHTML = `
      <div class="card" style="text-align:center; color:#888;">
        Belum ada karya 🌱
      </div>
    `
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

        <div style="font-size:11px; color:#6f7f76; margin-bottom:6px;">
          🌿 ${date}
        </div>

        <div style="font-size:13px; line-height:1.7; margin-bottom:10px;">
          ${post.deskripsi_proses}
        </div>

        <div style="display:flex; gap:14px; font-size:12px; color:#666; margin-bottom:10px;">
          <span onclick="reactPost('${post.id}','sruput')" style="cursor:pointer;">
            ☕ ${post.sruput_count || 0} Sruput
          </span>

          <span onclick="reactPost('${post.id}','cangkul')" style="cursor:pointer;">
            ⛏️ ${post.cangkul_count || 0} Cangkul
          </span>
        </div>

        <div>
          <input
            id="cmt-${post.id}"
            placeholder="Tulis komentar..."
            style="width:100%;padding:8px;border-radius:10px;border:1px solid #ddd;font-size:12px;"
          />

          <button class="btn-glow" onclick="sendComment('${post.id}')">
            Kirim
          </button>

          <div id="commentBox-${post.id}" style="margin-top:8px; font-size:12px; color:#444;"></div>
        </div>

      </div>
    `
  }).join("")

  // ✅ FIX PENTING: load komentar setelah render
  setTimeout(() => {
    data.forEach(p => loadComments(p.id))
  }, 0)
}
// =====================
// REACTION POST
// =====================

let reacting = false

async function reactPost(postId, type) {
  if (reacting) return
  reacting = true

  const { data: post } = await supabaseClient
    .from("contributions")
    .select("id, user_id, sruput_count, cangkul_count")
    .eq("id", postId)
    .single()

  if (post.user_id === currentWallet) {
    alert("Tidak bisa reaction sendiri 😄")
    reacting = false
    return
  }

  const { data: existing } = await supabaseClient
    .from("reactions")
    .select("*")
    .eq("post_id", postId)
    .eq("user_id", currentWallet)
    .maybeSingle()

  if (!existing) {
    await supabaseClient
      .from("reactions")
      .insert([{
        post_id: postId,
        user_id: currentWallet,
        type
      }])
  }

  if (type === "sruput") {
    await supabaseClient
      .from("contributions")
      .update({
        sruput_count: (post.sruput_count || 0) + 1
      })
      .eq("id", postId)
  }

  if (type === "cangkul") {
    await supabaseClient
      .from("contributions")
      .update({
        cangkul_count: (post.cangkul_count || 0) + 1
      })
      .eq("id", postId)
  }

  reacting = false
  loadUserPosts()
}

// =====================
// SEND COMMENT
// =====================

async function sendComment(postId) {
  const input = document.getElementById("cmt-" + postId)
  const text = input.value.trim()

  if (!text) return

  await supabaseClient
    .from("comments")
    .insert([{
      post_id: postId,
      user_id: currentWallet,
      comment: text
    }])

  input.value = ""

  // update comment section saja
  await loadComments(postId)
}
async function loadComments(postId) {
  const { data } = await supabaseClient
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: false })

  const box = document.getElementById("commentBox-" + postId)
  if (!box) return

  box.innerHTML = (data || []).map(c => `
    <div style="padding:4px 0; font-size:12px; color:#444;">
      💬 ${c.comment}
    </div>
  `).join("")
}

// ===================== REALTIME PROFILE SYNC =====================
setInterval(async () => {
  if (!currentWallet || !currentProfile) return

  const bal = await getWalletTofBalance(currentWallet)

  currentProfile.saldo_tof = bal

  renderProfile()
}, 10000) // tiap 10 detik