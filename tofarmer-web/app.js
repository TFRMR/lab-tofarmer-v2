let currentWallet = null
let currentProfile = null

// --- SATPAM LOGIN (RAMAH TAMU) ---
function checkLoginStatus() {
    const wallet = localStorage.getItem('tof_wallet');
    if (!wallet) {
        console.log("Pengunjung sedang melihat-lihat sebagai Guest 🌿");
        return;
    }
}
checkLoginStatus();

// ===================== WALLET =====================
async function connectWallet() {
  return new Promise((resolve) => {

    const modal = document.createElement("div")

    modal.innerHTML = `
    <div style="
      position:fixed;
      inset:0;
      background:rgba(16,25,20,.65);
      backdrop-filter:blur(12px);
      display:flex;
      justify-content:center;
      align-items:center;
      z-index:99999;
      padding:20px;
    ">
      <div style="
        width:100%;
        max-width:420px;
        background:#fff;
        border-radius:28px;
        padding:24px;
      ">
        <div style="text-align:center;">
          <div style="font-size:50px;">🌿</div>
          <h2 style="color:#2f6f4e;">Login/Daftar ToFarmer</h2>
          <p style="font-size:12px;color:#666;margin-top:8px;">Nama + Wallet Algorand</p>
<p style="font-size:12px;color:#666;margin-top:8px;">
  Daftar pakai Nama | Alamat Dompet Algorand<br>
  Bikin dompet dulu di Pera Wallet/Defly
</p>
        </div>
        <input id="tofName" placeholder="Nama pengguna" style="width:100%;margin-top:20px;padding:14px;border-radius:14px;border:1px solid #ddd;" />
        <input id="tofWallet" placeholder="Wallet Algorand" style="width:100%;margin-top:12px;padding:14px;border-radius:14px;border:1px solid #ddd;" />
        <button id="registerBtn" style="width:100%;">Masuk ke Ladang 🚀</button>
        <button id="cancelBtn" style="width:100%;margin-top:10px;padding:12px;border:none;border-radius:14px;background:#eee;color:#666;font-weight:600;cursor:pointer;">🐐 Batal</button>
      </div>
    </div>
    `

    document.body.appendChild(modal)

    modal.querySelector("#registerBtn").onclick = async () => {
      const username = document.getElementById("tofName").value.trim()
      const wallet = document.getElementById("tofWallet").value.trim()

      if (!username) {
        alert("Nama wajib diisi 🌱")
        return
      }

      try {
        const decoded = algosdk.decodeAddress(wallet)
        if (!decoded) throw new Error()
      } catch {
        alert("Wallet tidak valid / bukan Algorand 😄")
        return
      }

      const { data: existingUser } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", wallet)
        .maybeSingle()

      if (!existingUser) {
        const { error } = await supabaseClient
          .from("profiles")
          .insert([
            {
              id: wallet,
              username: username,
              xp: 0,
              saldo_tof: 0,
              level: 1,
              avatar_url: "https://www.tofarmer.xyz/aset/favicon.png"
            }
          ])

        if (error) {
          console.log(error)
          alert("Gagal daftar")
          return
        }
      }

      currentWallet = wallet
      localStorage.setItem("tof_wallet", wallet)

      await syncProfile(wallet)
      updateWalletUI()
      renderProfile()

      document.body.removeChild(modal)
      showWelcomePopup()
      resolve(wallet)
    }

    modal.querySelector("#cancelBtn").onclick = () => {
      document.body.removeChild(modal)
      resolve(null)
    }
  })
}

function showWelcomePopup() {
  const modal = document.createElement("div")
  modal.innerHTML = `
  <div style="position:fixed;inset:0;background:rgba(16,25,20,.6);backdrop-filter:blur(10px);display:flex;justify-content:center;align-items:center;z-index:99999;">
    <div style="background:linear-gradient(180deg,#ffffff,#f3f8f4);padding:26px;border-radius:26px;text-align:center;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(47,111,78,.25);border:1px solid rgba(76,175,122,.15);">
      <div style="font-size:55px;">🌿🎉</div>
      <h2 style="color:#2f6f4e;">Ladang Terbuka!</h2>
      <p style="color:#6f7f76;font-size:13px;margin:10px 0 20px;">Selamat datang di ToFarmer.<br>Dari kopi → ide → aksi → panen 🚀</p>
      <button onclick="this.parentElement.parentElement.remove()" style="width:100%;padding:12px;border:none;border-radius:14px;background:linear-gradient(90deg,#4caf7a,#c9a227);color:white;font-weight:bold;cursor:pointer;">Siap Panen Ide 🌱</button>
    </div>
  </div>
  `
  document.body.appendChild(modal)
}

function logoutWallet() {
  const yakin = confirm("Yakin ingin meninggalkan ladang? 🌱");
  if (!yakin) return;

  currentWallet = null
  currentProfile = null
  localStorage.removeItem("tof_wallet")
  localStorage.removeItem("tof_user_id")
  updateWalletUI()
  renderProfile()
  window.location.href = 'index.html'; 
}




// ===================== POSTING SYSTEM =====================
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
    <div style="position:fixed;inset:0;background:rgba(16,25,20,.55);backdrop-filter:blur(10px);display:flex;justify-content:center;align-items:flex-start;padding-top:40px;overflow-y:auto;z-index:99999;padding:20px;">
      <div style="width:100%;max-width:430px;max-height:85vh;overflow-y:auto;background:linear-gradient(180deg,#fff,#f3f8f4);border-radius:28px;padding:26px;box-shadow:0 20px 60px rgba(47,111,78,.18);border:1px solid rgba(76,175,122,.12);">
        <div style="text-align:center;">
          <div style="font-size:50px;">☕🌿</div>
          <h2 style="color:#2f6f4e;">Mau ditanam di ladang mana?</h2>
          <p style="color:#6f7f76;font-size:13px;">Pilih dulu temamu 😎</p>
        </div>
        <div style="display:grid;gap:10px;margin-top:20px;">
          <button class="pilar-btn" data-p="community">🤝 Titik Kumpul <small>Ngopi, ide, ngobrol, santai ,ngonten</small></button>
          <button class="pilar-btn" data-p="inovasi">🤖 Ladang Eksperimen <small>AI, blockchain, robot, dan ide yang kadang “nggak masuk akal”</small></button>
          <button class="pilar-btn" data-p="ladang">🌱 Cerita Tanah & Panen <small>Drama masuk kebun</small></button>
          <button class="pilar-btn" data-p="finance">☕ Duit...duit dan duit <small>TOF, aset, strategi biar ladang tetap jalan</small></button>
          <button class="pilar-btn" data-p="refleksi">🔥 Mode Petapa Gunung <small>Renungan, kabut pagi, dan pikiran random</small></button>
        </div>
        <button id="cancelPilar" style="width:100%;margin-top:16px;padding:12px;border:none;border-radius:16px;background:#eef4ef;color:#6f7f76;font-weight:600;">🐐 batal, kambing panen dulu</button>
      </div>
    </div>
    `
    document.body.appendChild(modal)

    modal.querySelectorAll(".pilar-btn").forEach(btn => {
      btn.onclick = () => {
        const value = btn.dataset.p
        document.body.removeChild(modal)
        resolve(value)
      }
    })

    modal.querySelector("#cancelPilar").onclick = () => {
      document.body.removeChild(modal)
      resolve(null)
    }
  })
}

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
  if (userChoice === null) return null

  return userChoice || rekomendasiAwal
}

async function sendPost() {
  let imageUrl = null
  const input = document.getElementById("postBox")
  const imageInput = document.getElementById("imageInput")
  if (!input) return

  const text = input.value.trim()
  if (!text) return

  const pilar = await classifyPilar(text)
  if (!pilar) return

  const file = imageInput?.files?.[0] || null

  if (file instanceof File) {
    const fileName = `${currentWallet}-${Date.now()}-${file.name || "img"}`
    const { error: uploadError } = await supabaseClient.storage
      .from("post-images")
      .upload(fileName, file, { cacheControl: "3600", upsert: false })

    if (uploadError) {
      alert("Upload gambar gagal: " + uploadError.message)
      return
    }

    const { data } = supabaseClient.storage.from("post-images").getPublicUrl(fileName)
    if (!data?.publicUrl) {
      alert("Gagal ambil URL gambar")
      return
    }
    imageUrl = data.publicUrl
  }

  const isSelfPost = true
  const xpBonus = isSelfPost ? 20 : 5

 const { error } = await supabaseClient
    .from("contributions")
    .insert([
      {
        user_id: currentWallet,
        pilar_aksi: PILAR_MAP[pilar],
        judul_aksi: "Feed Post",
        deskripsi_proses: text,
        image_url: imageUrl,
        status_validasi: "pending",
        xp_reward: xpBonus,
        is_self_post: isSelfPost,
        is_private: false // <<< TAMBAHKAN BARIS INI AGAR TEGAS SEBAGAI POSTINGAN PUBLIK
      }
    ])

  if (currentProfile) {
    const newXP = (currentProfile.xp || 0) + xpBonus
    const { error: xpError } = await supabaseClient
      .from("profiles")
      .update({ xp: newXP })
      .eq("id", currentWallet)

    if (!xpError) {
      currentProfile.xp = newXP
      renderProfile()
    }
  }

  if (error) {
    alert("Gagal kirim: " + error.message)
    return
  }

  input.value = ""
  if (imageInput) imageInput.value = ""

  loadFeed()

  
}

// ===================== ECONOMY & ALGORAND INFRA =====================
const TOF_ASSET_ID = 3558306283
const ALGONODE_URL = "https://mainnet-api.algonode.cloud"

async function getWalletTofBalance(wallet) {
  try {
    if (!wallet) return 0
    const res = await fetch(`${ALGONODE_URL}/v2/accounts/${wallet}`)
    if (!res.ok) return 0

    const account = await res.json()
    const asset = account.assets?.find(a => Number(a["asset-id"]) === TOF_ASSET_ID)
    return asset ? Number(asset.amount) / 1000000 : 0
  } catch (err) {
    console.log("Wallet fetch gagal:", wallet)
    return 0
  }
}

async function refreshUserBalance() {
  if (!currentWallet || !currentProfile) return
  const balance = await getWalletTofBalance(currentWallet)
  currentProfile.saldo_tof = balance
  renderProfile()
}



async function loadEconomy() {
  try {
    // Tarik id dan xp dari supabase
    const { data: profiles, error } = await supabaseClient.from("profiles").select("id, xp")
    if (error || !profiles) return

    const totalAsset = document.getElementById("totalAsset")
    if (totalAsset) totalAsset.innerText = "Sync..."

    let total = 0
    const batchSize = 5
    
    // --- TETAP PERTAHANKAN BATCH PROMISE BLOCKCHAIN ALGORAND ---
    for (let i = 0; i < profiles.length; i += batchSize) {
      const batch = profiles.slice(i, i + batchSize)
      const balances = await Promise.all(batch.map(user => getWalletTofBalance(user.id)))
      total += balances.reduce((sum, bal) => sum + bal, 0)
    }

    const totalFixed = Number(total) || 0
    if (totalAsset) {
      totalAsset.innerText = totalFixed.toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " TOF"
    }

    // Jalankan progres bar fase dan tumpukan avatar stack
    setTimeout(() => { typeof updateFaseProgress === "function" && updateFaseProgress(totalFixed) }, 100)
    loadAvatarStack()

    // --- SINKRONISASI COUTER BARIS ATAS ---
    const growerEl = document.getElementById("rankSummary")
    if (growerEl && typeof getRankStats === "function") {
      const stats = getRankStats(profiles)
      growerEl.innerHTML = `Total-${profiles.length} ( 🌱${stats.grower} | 🥉${stats.pro} | 🥈${stats.specialist} | 🥇${stats.elite} )`
    }
  } catch (err) {
    console.log("ECONOMY ERROR:", err)
  }
}

function formatShort(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(".0","") + "M"
  if (num >= 1000) return (num / 1000).toFixed(1).replace(".0","") + "K"
  return num.toString()
}

function updateFaseProgress(totalTof) {
  const faseBar = document.getElementById("faseBar")
  const faseText = document.getElementById("faseText")
  if (!faseBar || !faseText) return

  totalTof = Number(totalTof) || 0
  const fases = [
    { name: "FASE 1", target: 10 }, { name: "FASE 2", target: 500 },
    { name: "FASE 3", target: 1000 }, { name: "FASE 4", target: 3000 },
    { name: "FASE 5", target: 10000 }, { name: "FASE 6", target: 30000 },
    { name: "FASE 7", target: 100000 }
  ]

  let currentPhase = fases[0]
  let previousTarget = 0
  for (let i = 0; i < fases.length; i++) {
    if (totalTof <= fases[i].target) { currentPhase = fases[i]; break; }
    previousTarget = fases[i].target
  }

  const range = currentPhase.target - previousTarget
  let progress = range > 0 ? ((totalTof - previousTarget) / range) * 100 : 100
  progress = Math.max(0, Math.min(progress, 100))
  faseBar.style.width = progress + "%"

  const sisa = Math.max(0, currentPhase.target - totalTof)
  faseText.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:#2f6f4e;">🌿 ${currentPhase.name}</div>
    <div style="font-size:10px;color:#6f7f76;margin-top:2px;">${Math.floor(progress)}% progress</div>
    <div style="font-size:10px;color:#b5942b;margin-top:2px;">${formatShort(totalTof)} / ${formatShort(currentPhase.target)} TOF</div>
    <div style="font-size:10px;color:#999;margin-top:2px;">Sisa ${formatShort(sisa)} TOF</div>
  `
}

// ===================== RENDERING LINI MASA (FEED) =====================
async function loadFeed() {
  const feed = document.getElementById("feed")
  if (!feed) return
  feed.innerHTML = ""

  const { data: posts, error: postError } = await supabaseClient
    .from("contributions")
    .select(`id, created_at, deskripsi_proses, image_url, sruput_count, cangkul_count, profiles!inner(id, username, avatar_url)`)
    .eq("is_private", false)
    .order("created_at", { ascending: false })

  if (postError || !posts) {
    feed.innerHTML = "<div>Gagal load post</div>"
    return
  }

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const postIdParam = urlParams.get("post");
    if (postIdParam) {
      const matchedPost = posts.find(p => String(p.id) === String(postIdParam));
      if (matchedPost) {
        const petikTeks = matchedPost.deskripsi_proses ? matchedPost.deskripsi_proses.substring(0, 100) + "..." : "Intip progres karya di ToFarmer.";
        const namaPetani = matchedPost.profiles?.username || "Petani";
        document.title = `Catatan Karya @${namaPetani} | ToFarmer`;
        
        const metaDesc = document.getElementById("postDesc");
        const ogTitle = document.getElementById("ogTitle");
        const ogDesc = document.getElementById("ogDesc");
        const ogImage = document.getElementById("ogImage");

        if (metaDesc) metaDesc.setAttribute("content", petikTeks);
        if (ogTitle) ogTitle.setAttribute("content", `🌿 Catatan Karya @${namaPetani}`);
        if (ogDesc) ogDesc.setAttribute("content", petikTeks);
        if (matchedPost.image_url && ogImage) ogImage.setAttribute("content", matchedPost.image_url);
      }
    }
  } catch (metaErr) { console.log(metaErr); }

let comments = [];
  try {
    const postIds = posts.map(p => String(p.id));

const { data: rawComments, error: qErr } = await supabaseClient
  .from("comments")
  .select("*")
  .in("post_id", postIds);
    
    if (qErr) console.log("Gagal ambil data komentar:", qErr);
    
    if (rawComments && rawComments.length > 0) {
      // 2. Ambil data profil secara mandiri tanpa join database
      const { data: allProfiles } = await supabaseClient
        .from("profiles")
        .select("id, username, avatar_url");

      // 3. Jodohkan user_id komentar dengan id profil di memori browser (100% Anti-Gagal!)
      comments = rawComments.map(c => {
        const pencocok = allProfiles ? allProfiles.find(p => String(p.id).trim() === String(c.user_id).trim()) : null;
        return {
          ...c,
          profiles: pencocok || { username: "Petani_Misterius", avatar_url: "https://www.tofarmer.xyz/aset/favicon.png", id: "" }
        };
      });
    }
  } catch (e) { 
    console.log("Sistem komentar bermasalah:", e);
    comments = []; 
  }
 posts.forEach(item => {
    const div = document.createElement("div")
    div.className = "post"
    div.id = `post-card-${item.id}` // 🟢 Tambahkan ini sebagai jangkar koordinat

    const username = item.profiles?.username || "guest"
    const avatar = item.profiles?.avatar_url || "https://via.placeholder.com/40"
    
    // KODE BARU: Langsung saring dari array komentar yang sudah matang dijodohkan di atas
    // Memaksa perbandingan tipe string literal agar tidak meleset karena tipe BigInt/Number
    const postComments = comments.filter(c => c && String(c.post_id).trim() === String(item.id).trim());
    const date = new Date(item.created_at).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const safeText = (item.deskripsi_proses || "").replace(/`/g, "\\`").replace(/\$/g, "\\$");

    // KUNCI FB: Cek apakah postingan ini milik user yang sedang login sekarang
    const isMyPost = item.profiles?.id === currentWallet;

    div.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:between; gap:8px; width:100%;">
        <div style="display:flex; align-items:center; gap:8px; flex:1;">
          <img src="${avatar}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;" />
          <div onclick="window.location.href='profile.html?id=${item.profiles?.id}'" style="font-weight:600;color:#2f6f4e;cursor:pointer;">@${username}</div>
        </div>
        
        ${isMyPost ? `
        <div class="post-menu-container" style="position: relative; display: inline-block;">
          <button class="btn-dot-menu" onclick="toggleDotMenu('${item.id}')" style="background:none; border:none; color:#65676b; font-size:16px; cursor:pointer; padding:4px 8px;">•••</button>
          <div class="dot-dropdown" id="dropdown-${item.id}" style="display:none; position:absolute; right:0; top:24px; background:white; box-shadow:0 2px 12px rgba(0,0,0,0.15); border-radius:8px; z-index:100; min-width:150px; border:1px solid #e4e6eb; padding:4px 0;">
            <button onclick="aksiEditPostingan('${item.id}', \`${safeText}\`)" style="width:100%; text-align:left; background:none; border:none; padding:8px 12px; font-size:12px; color:#050505; cursor:pointer;">✏️ Edit Postingan</button>
            <button onclick="aksiSembunyikanKeProfil('${item.id}')" style="width:100%; text-align:left; background:none; border:none; padding:8px 12px; font-size:12px; color:#050505; cursor:pointer;">🔒 Sembunyikan ke Profil</button>
          </div>
        </div>
        ` : ''}
      </div>
      <div style="font-size:11px;color:#6f7f76;margin-bottom:6px;">${date}</div>
      <div class="text" style="margin-top:6px;">${convertMentions(item.deskripsi_proses || "")}</div>
      ${item.image_url ? `<div style="margin-top:10px;display:flex;justify-content:center;"><img src="${item.image_url}" style="max-width:100%;max-height:420px;border-radius:14px;border:1px solid rgba(0,0,0,0.08);" /></div>` : ""}
      <div style="margin-top:4px;display:flex;gap:12px;font-size:12px;color:#666;">
        <span onclick="reactPost('${item.id}','sruput')" style="cursor:pointer;">☕ ${item.sruput_count || 0} Sruput</span>
        <span onclick="reactPost('${item.id}','cangkul')" style="cursor:pointer;">⛏️ ${item.cangkul_count || 0} Cangkul</span>
      </div>
      <div class="post-actions"><button class="share-btn" onclick="sharePost('${item.id}', '${username}', \`${safeText}\`)">📢 Bagikan Progres</button></div>
      <div style="margin-top:10px; padding-top:8px; border-top:1px solid #f0f0f0; display:flex; gap:16px; font-size:12px; color:#6f7f76;">
        <span onclick="toggleKomentarBox('${item.id}')" style="cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:4px;">
          💬 ${postComments.length} Komentar
        </span>
      </div>

      <div id="box-komentar-${item.id}" style="display:none; margin-top:12px; padding:12px; background:#f8faf9; border-radius:12px;">
        
        <div style="display:flex; gap:8px; margin-bottom:12px;">
          <input id="comment-${item.id}" placeholder="Tulis komentar ladang..." style="flex-grow:1; padding:8px 12px; border-radius:20px; border:1px solid #ddd; font-size:12px; outline:none;" />
          <button type="button" onclick="sendComment('${item.id}')" style="margin-top:0; width:auto; padding:6px 14px; font-size:12px; border-radius:20px;">Kirim</button>
        </div>

        <div id="list-komentar-${item.id}" style="display:flex; flex-direction:column; gap:10px; font-size:12px;">
          ${postComments.length === 0 ? `<div id="empty-comment-${item.id}" style="color:#999; text-align:center; padding:5px 0;">Belum ada diskusi, yuk sapa petani! 🌱</div>` : ''}
          
         ${postComments.map(c => {
            if (!c) return '';
            // Ambil data profile dari objek gabungan Supabase
            const cUser = (c.profiles && c.profiles.username) ? c.profiles.username : "Petani_Misterius";
            const cAvatar = (c.profiles && c.profiles.avatar_url) ? c.profiles.avatar_url : "https://www.tofarmer.xyz/aset/favicon.png";
            const cUserId = (c.profiles && c.profiles.id) ? c.profiles.id : "";
            const isiKomentar = c.comment || "";
            
            return `
              <div style="display:flex; align-items:flex-start; gap:8px; margin-top:6px;">
                <img src="${cAvatar}" 
                     onclick="if('${cUserId}') window.location.href='profile.html?id=${cUserId}'" 
                     style="width:24px; height:24px; border-radius:50%; object-fit:cover; cursor:pointer; border:1px solid rgba(0,0,0,0.08);" />
                
                <div style="background:#ffffff; padding:6px 12px; border-radius:14px; border:1px solid rgba(0,0,0,0.05); max-width:calc(100% - 32px);">
                  <span onclick="if('${cUserId}') window.location.href='profile.html?id=${cUserId}'" 
                        style="font-weight:700; color:#2f6f4e; cursor:pointer; margin-right:4px;">
                    @${cUser}
                  </span>
                  <span style="color:#2c3a33; white-space:pre-wrap;">${convertMentions(isiKomentar)}</span>
                </div>
              </div>
            `;
          }).join("")}
        </div>

      </div>
    `
    feed.appendChild(div)
  })
}

// ===================== MANAGEMENT PROFIL =====================
function renderProfile() {
  const userBox = document.getElementById("profileInfo")
  const avatar = document.getElementById("profileAvatar")
  if (!userBox) return

  if (!currentProfile) {
    if (avatar) avatar.style.display = "none"
    userBox.innerHTML = `
      <div style="font-weight:700;font-size:15px;color:#2f6f4e;">@guest</div>
      <button onclick="alert('Login dulu ya 🌱')" style="margin-top:10px;width:100%;padding:8px;border:none;border-radius:12px;background:#ddd;font-size:12px;">👤 Masuk Profil</button>
      <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div class="card" style="padding:8px;margin:0;"><div style="font-size:10px;color:#888;">XP</div><div style="font-weight:700;font-size:12px;">0</div></div>
        <div class="card" style="padding:8px;margin:0;"><div style="font-size:10px;color:#888;">TOF</div><div style="font-weight:700;color:#c9a227;font-size:12px;">0</div></div>
      </div>
      <div style="margin-top:8px;background:#eef7f1;border-radius:999px;padding:6px 12px;display:inline-block;color:#2f6f4e;font-size:11px;font-weight:600;">🌱 BELUM LOGIN</div>
    `
    return
  }

  if (avatar) {
    avatar.style.display = "block"
    avatar.src = currentProfile.avatar_url || "https://via.placeholder.com/100"
  }

  // Hitung Level dan Rank dinamis berdasarkan formula Tangga Pangkat progresif
  const calculatedLevel = typeof getTofLevel === "function" ? getTofLevel(currentProfile.xp || 0) : 1;
  const calculatedRank = typeof getRank === "function" ? getRank(currentProfile.xp || 0) : "GROWER";

  // Pasang badge emoji visual pendamping pangkat tangga beranda
  let rankEmoji = "🌱 GROWER";
  if (calculatedRank === "PRO") rankEmoji = "🥉 PRO";
  if (calculatedRank === "SPECIALIST") rankEmoji = "🥈 SPECIALIST";
  if (calculatedRank === "ELITE") rankEmoji = "🥇 ELITE";

  userBox.innerHTML = `
    <div style="font-weight:700;font-size:15px;color:#2f6f4e;">@${currentProfile.username}</div>
    <button onclick="window.location.href='profile.html?id=${currentWallet}'" style="margin-top:10px;width:60%;padding:8px;border:none;border-radius:12px;background:linear-gradient(90deg,#4caf7a,#c9a227);color:white;font-size:12px;font-weight:600;cursor:pointer;">☕ Masuk Profil </button>
    <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="card" style="padding:8px;margin:0;"><div style="font-size:10px;color:#888;">XP</div><div style="font-weight:700;font-size:12px;">${Math.floor(currentProfile.xp || 0)}</div></div>
      <div class="card" style="padding:8px;margin:0;"><div style="font-size:10px;color:#888;">TOF</div><div style="font-weight:700;color:#c9a227;font-size:12px;">${Number(currentProfile.saldo_tof || 0).toLocaleString("id-ID")}</div></div>
    </div>
    <div style="margin-top:8px;background:#eef7f1;border-radius:999px;padding:6px 12px;display:inline-block;color:#2f6f4e;font-size:11px;font-weight:600;">
      ${rankEmoji} • Level ${calculatedLevel}
    </div>
  `
}

// Fitur listener upload avatar bawaan jangan diubah, biarkan utuh di bawah renderProfile
document.addEventListener("change", async (e) => {
  if (e.target.id !== "avatarInput") return
  if (!currentWallet) { alert("Connect wallet dulu 😄"); return; }

  const file = e.target.files[0]
  if (!file) return

  const fileName = currentWallet + "-" + Date.now()
  const { data: uploadData, error: uploadError } = await supabaseClient.storage.from("avatars").upload(fileName, file)

  if (uploadError) { alert("Upload gagal: " + uploadError.message); return; }

  const { data } = supabaseClient.storage.from("avatars").getPublicUrl(fileName)
  const avatarUrl = data.publicUrl

  const { error: updateError } = await supabaseClient.from("profiles").update({ avatar_url: avatarUrl }).eq("id", currentWallet)
  if (updateError) { alert("Gagal update profile"); return; }

  currentProfile.avatar_url = avatarUrl
  renderProfile()
  loadEconomy()
  alert("Foto berhasil diganti 🌿")
})

function convertMentions(text) {
  if (!text) return "";

  // 1. Pola Regex cerdas untuk menangkap segala jenis bentuk link (http, https, www, maupun ekstensi langsung)
  const linkPattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\b[A-Z0-9._%+-]+\.(com|org|id|net|xyz|app|online|tech)\b([-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])?)/ig;

  let result = text.replace(linkPattern, function(url) {
    let href = url;
    
    // Skenario antisipasi tanda baca di akhir kalimat agar tidak ikut kecatut ke dalam link
    let akhirTandaBaca = "";
    if (/[.,;:!?]$/.test(url)) {
      akhirTandaBaca = url.slice(-1);
      url = url.slice(0, -1);
      href = url;
    }

    // Jika user menulis tanpa http/https (misal cuma www.xxx atau langsung xxx.com), 
    // kita wajib tambahkan 'https://' di href-nya agar browser tidak mengira itu link internal halaman web ToFarmer
    if (!/^https?:\/\//i.test(href)) {
      href = "https://" + href;
    }

    return `<a href="${href}" target="_blank" style="color: #2f6f4e; font-weight: 600; text-decoration: none; border-bottom: 1px dashed #4caf7a;" onmouseover="this.style.color='#b5942b'" onmouseout="this.style.color='#2f6f4e'">${url}</a>${akhirTandaBaca}`;
  });

  // 2. Pertahankan fitur deteksi @mention bawaan Anda
  result = result.replace(/@([a-zA-Z0-9_]+)/g, `<span class="tof-mention" onclick="goToUsername('$1')" style="color:#6ea84f;font-weight:700;cursor:pointer;">@$1</span>`);

  // 3. Pertahankan fitur ganti baris enter bawaan Anda
  result = result.replace(/\n/g, "<br>");

  return result;
}
async function goToUsername(username) {
  const { data, error } = await supabaseClient.from("profiles").select("id").eq("username", username).maybeSingle()
  if (error || !data) { alert("Petani tidak ditemukan 🌱"); return; }
  window.location.href = `profile.html?id=${data.id}`
}

async function loadAvatarStack() {
  const { data, error } = await supabaseClient.from("profiles").select("id, avatar_url, username").limit(30)
  const container = document.getElementById("avatarStack")
  if (!container || error || !data) return

  container.innerHTML = ""
  data.forEach(user => {
    const img = document.createElement("img")
    img.src = user.avatar_url || "https://via.placeholder.com/100"
    img.className = "avatar-item"
    img.title = user.username
    img.onclick = () => { window.location.href = `profile.html?id=${user.id}` }
    container.appendChild(img)
  })
}

// ===================== BOOTSTRAP INIT =====================
window.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("tof_wallet")
  if (saved) {
    currentWallet = saved
    syncProfile(saved).then(() => {
      updateWalletUI()
      renderProfile()
    })
  }

loadFeed().then(() => {
    // 1. BUAT KANTONG URL (PENTING: Ini yang sebelumnya hilang sehingga bikin macet!)
    const urlParams = new URLSearchParams(window.location.search);
    const postIdParam = urlParams.get("post");

    if (postIdParam) {
      // 2. Beri jeda 1000 milidetik (1 detik) agar browser selesai menggambar kartu & komentar di layar
      setTimeout(() => {
        const targetCard = document.getElementById(`post-card-${postIdParam}`);
        if (targetCard) {
          
          // 3. OTOMATIS BUKA KOTAK KOMENTAR (Biar user langsung bisa baca/tulis diskusi)
          if (typeof toggleKomentarBox === "function") {
            toggleKomentarBox(postIdParam);
          }

          // 4. Hitung lokasi koordinat kartu tersebut di dalam halaman web
          const koordinatY = targetCard.getBoundingClientRect().top + window.scrollY;
          
          // 5. Luncurkan layar otomatis ke lokasi kartu secara mulus
          window.scrollTo({
            top: koordinatY - 100, // Dikurangi 100px agar ada jarak ruang nyaman di atas kartu
            behavior: 'smooth'    // Memberikan efek meluncur halus yang estetik
          });
          
          // 6. Beri efek highlight visual (bingkai hijau + bayangan menyala) agar user tahu itu pos tujuan
          targetCard.style.transition = "all 0.8s ease";
          targetCard.style.boxShadow = "0 0 20px rgba(47, 111, 78, 0.4)";
          targetCard.style.borderColor = "#2f6f4e";
          targetCard.style.borderWidth = "2px";
        }
      }, 1000); // Durasi 1000ms sangat aman bahkan saat koneksi internet sedang lambat
    }
  });

  // 🟢 BATAS BAWAH KODE BARU AMAN SUNTIK
  loadAvatarStack()
  loadEconomy()

  if (typeof loadRankSummary === "function") {
    loadRankSummary()
  }

  setTimeout(async () => {
    const { data: currentFeedPosts } = await supabaseClient
      .from("contributions")
      .select("deskripsi_proses, profiles(username)")
      .eq("is_private", false)
      .order("created_at", { ascending: false })
      .limit(5);

    const konteksBeranda = generateFeedContext(currentFeedPosts || []);
    const pondasiDasar = typeof cariKonteksPaper === "function" ? cariKonteksPaper("filosofi pilar") : "";

    // 🌟 AMBIL USERNAME SECARA DINAMIS (Jika belum login, pakai 'Petani')
    const namaUserAktif = currentProfile ? currentProfile.username : "Petani";

    updateAdvice(
      "sapaan", 
      `Kamu adalah asisten/mentor petani di beranda komunitas ToFarmer. Sapa pengguna dengan akrab berdasarkan esensi nilai visi-misi ekosistem serta rekam data berikut.\n\n[NILAI AGRAREIS FONDASI]:\n${pondasiDasar}\n\n[KONDISI TERKINI]:\n${konteksBeranda}`, 
      // 🌟 KUNCI PERBAIKAN: Masukkan nama user aktif ke dalam teks input utama AI
      `User bernama @${namaUserAktif} baru saja membuka beranda utama ToFarmer. Sapa dia langsung dengan nama akunnya tersebut!`
    );
  }, 2000);
});
// --- FUNGSI ALA FACEBOOK UNTUK KONTROL BUKA/TUTUP KOTAK KOMENTAR ---
function toggleKomentarBox(postId) {
  const box = document.getElementById(`box-komentar-${postId}`);
  if (!box) return;
  
  if (box.style.display === "none" || box.style.display === "") {
    box.style.display = "block";
  } else {
    box.style.display = "none";
  }
}
async function sendComment(postId) {
  const input = document.getElementById(`comment-${postId}`);
  if (!input) return;
  const commentText = input.value.trim();
  if (!commentText) return;

  if (!currentWallet) {
    alert("Connect wallet dulu untuk ikut berdiskusi 🌱");
    return;
  }

  // 1. Kirim data ke database Supabase
  const { data, error } = await supabaseClient
    .from("comments")
    .insert([
      {
        post_id: postId,
        user_id: currentWallet,
        comment: commentText
      }
    ]);

  if (error) {
    alert("Gagal mengirim komentar: " + error.message);
    return;
  }

  // 2. Ambil container list diskusi spesifik yang sudah kita beri ID di Langkah 2
  const listContainer = document.getElementById(`list-komentar-${postId}`);
  if (!listContainer) return;

  // Hapus tulisan "Belum ada diskusi" jika ini adalah komentar pertama di post tersebut
  const emptyMessage = document.getElementById(`empty-comment-${postId}`);
  if (emptyMessage) {
    emptyMessage.remove();
  }

  // 3. Siapkan data profil lokal untuk langsung dirender secara instan
  const currentUsername = currentProfile ? currentProfile.username : "Petani";
  const currentAvatar = currentProfile ? currentProfile.avatar_url : "https://www.tofarmer.xyz/aset/favicon.png";

  // 4. Struktur HTML untuk komentar baru Anda
  const newCommentHtml = `
    <div style="display:flex; align-items:flex-start; gap:8px; margin-top:6px;">
      <img src="${currentAvatar}" style="width:24px; height:24px; border-radius:50%; object-fit:cover; border:1px solid rgba(0,0,0,0.08);" />
      <div style="background:#ffffff; padding:6px 12px; border-radius:14px; border:1px solid rgba(0,0,0,0.05); max-width:calc(100% - 32px);">
        <span style="font-weight:700; color:#2f6f4e; margin-right:4px;">@${currentUsername}</span>
        <span style="color:#2c3a33; white-space:pre-wrap;">${convertMentions(commentText)}</span>
      </div>
    </div>
  `;

  // 5. Suntikkan HTML ke bagian paling bawah container tanpa merusak state halaman
  listContainer.insertAdjacentHTML('beforeend', newCommentHtml);

  // 6. Bersihkan kotak input komentar
  input.value = "";

  // 7. Update text counter jumlah komentar secara dinamis di luar kotak
  const counterEl = document.querySelector(`[onclick="toggleKomentarBox('${postId}')"]`);
  if (counterEl) {
    // Ambil angka lama, tambah 1, lalu tulis ulang
    const currentCount = parseInt(counterEl.innerText.replace(/[^0-9]/g, '')) || 0;
    counterEl.innerHTML = `💬 ${currentCount + 1} Komentar`;
  }
}
let isReactingFeed = false; // <-- Ini gembok pengamannya

async function reactPost(postId, type) {
  if (!currentWallet) {
    alert("Connect wallet dulu untuk memberikan apresiasi 🌱");
    return;
  }

  if (isReactingFeed) return; // <-- Jika gembok masih mengunci, abaikan klik selanjutnya!
  isReactingFeed = true;      // <-- Kunci pintu!

  try {
    const { error } = await supabaseClient
      .rpc(type === 'sruput' ? 'increment_sruput' : 'increment_cangkul', { row_id: postId });

    if (error) {
      console.log("RPC gagal, mencoba metode update alternatif...");
    }

    // A. KUNCI KOORDINAT LAYAR
    const targetCard = document.getElementById(`post-card-${postId}`);
    const koordinatY = targetCard ? targetCard.getBoundingClientRect().top + window.scrollY : 0;

    // B. Muat ulang lini masa feed
    // Jalankan feed pertama kali
  await loadFeed();

  // Panggil pengisian daftar peringkat petani untuk radar card
  loadRadarPeringkat();


    // C. KEMBALIKAN POSISI SCROLL LAYAR
    if (koordinatY) {
      window.scrollTo({
        top: koordinatY - 100, 
        behavior: 'auto'       
      });
    }

  } catch (err) {
    console.log("Gagal memproses reaksi:", err);
  } finally {
    isReactingFeed = false; // <-- Selesai / Error? Buka kembali gemboknya!
  }
}
function sharePost(postId, username, text) {
  // 1. Susun URL unik yang mengarah langsung ke postingan ini di halaman profil
  // Menggunakan window.location.origin + pathname agar dinamis baik di lokal maupun domain live
  const shareUrl = `${window.location.origin}${window.location.pathname}?u=${username}&post=${postId}`;

 navigator.clipboard.writeText(shareUrl).then(() => {
    alert(`📢 Tautan karya @${username} berhasil disalin! Siap dibagikan ke komunitas 🌱\n\nLink: ${shareUrl}`);
  }).catch((err) => {
    console.error("Gagal menyalin tautan:", err);
    alert(`Salin tautan ini secara manual:\n${shareUrl}`);
  });
}

// 🟢 AWAL SISIPAN: FUNGSI MEMBACA PERINGKAT UNTUK RADAR CARD
function getRadarRank(xp) {
  const lvl = Math.floor(Math.sqrt(xp / 100)) + 1;
  if (lvl >= 50) return "👑 Mahaguru ladang";
  if (lvl >= 40) return "🧙‍♂️ Sesepuh Kebun";
  if (lvl >= 30) return "👨‍🌾 Penguasa Lahan";
  if (lvl >= 20) return "🌱 Petani Teladan";
  if (lvl >= 10) return "🌿 Pembasmi Gulma";
  if (lvl >= 5)  return "🍃 Penyiram Ulung";
  return "🪵 Buruh Macul";
}

async function loadRadarPeringkat() {
  const wadahRadar = document.getElementById("radar-peringkat-list");
  if (!wadahRadar) return;

  try {
    // 🟢 SUDAH FIX: diganti menjadi 'supabaseClient'
    const { data: users, error } = await supabaseClient
      .from("profiles")
      .select("username, xp")
      .order("xp", { ascending: false })
      .limit(10);

    if (error) throw error;

    if (users && users.length > 0) {
      wadahRadar.innerHTML = users.map((user, indeks) => {
        const posisi = indeks + 1;
        let medali = `${posisi}.`;
        if (posisi === 1) medali = "🥇";
        if (posisi === 2) medali = "🥈";
        if (posisi === 3) medali = "🥉";

        const xpUser = user.xp || 0;
        const levelUser = Math.floor(Math.sqrt(xpUser / 100)) + 1;

        return `
          <div style="display:flex;align-items:center;justify-content:space-between;background:#f8fafc;border:1px solid #f1f5f9;padding:6px 10px;border-radius:8px;font-size:11px;">
            <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1;">
              <span style="font-weight:bold;color:#64748b;width:16px;flex-shrink:0;">${medali}</span>
              <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                <strong style="color:#1e293b;">@${user.username}</strong>
                <div style="font-size:9px;color:#64748b;">${getRadarRank(xpUser)}</div>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;font-weight:600;color:#2f6f4e;background:#eef7f1;padding:2px 6px;border-radius:999px;font-size:10px;margin-left:4px;">
              Lvl ${levelUser} <span style="font-size:9px;font-weight:normal;color:#6f7f76;">(${xpUser})</span>
            </div>
          </div>
        `;
      }).join("");
    } else {
      wadahRadar.innerHTML = `<p style="font-size:11px;color:#94a3b8;text-align:center;margin:0;">Belum ada data petani.</p>`;
    }
  } catch (err) {
    console.error("Gagal memuat radar peringkat:", err);
    wadahRadar.innerHTML = `<p style="font-size:11px;color:#ef4444;text-align:center;margin:0;">⚠️ Gagal memuat peringkat</p>`;
  }
}
// 🟢 AKHIR SISIPAN FUNGSI
// Fungsi pengendali menu dropdown titik tiga ala FB untuk Beranda utama
function toggleDotMenu(postId) {
  const dropdown = document.getElementById(`dropdown-${postId}`);
  if (!dropdown) return;
  document.querySelectorAll('.dot-dropdown').forEach(el => {
    if (el.id !== `dropdown-${postId}`) el.style.display = 'none';
  });
  dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

window.addEventListener('click', function(e) {
  if (!e.target.matches('.btn-dot-menu')) {
    document.querySelectorAll('.dot-dropdown').forEach(el => el.style.display = 'none');
  }
});

async function aksiEditPostingan(postId, teksLama) {
  const teksBaru = prompt("Edit postingan Anda:", teksLama);
  if (teksBaru === null) return;
  if (!teksBaru.trim()) return alert("Teks tidak boleh kosong!");

  const { error } = await supabaseClient
    .from("contributions")
    .update({ deskripsi_proses: teksBaru.trim() })
    .eq("id", postId);

  if (error) {
    alert("Gagal mengedit: " + error.message);
  } else {
    alert("Postingan berhasil diperbarui! 🌱");
    if (typeof loadFeed === "function") loadFeed();
  }
}

async function aksiSembunyikanKeProfil(postId) {
  const yakin = confirm("Sembunyikan dari Beranda Utama? Postingan tetap tersimpan aman di Profil pribadi Anda.");
  if (!yakin) return;

  const { error } = await supabaseClient
    .from("contributions")
    .update({ is_private: true })
    .eq("id", postId);

  if (error) {
    alert("Gagal menyembunyikan: " + error.message);
  } else {
    alert("Postingan berhasil dipindahkan ke arsip profil pribadi 🔒");
    if (typeof loadFeed === "function") loadFeed();
  }
}
