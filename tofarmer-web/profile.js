const currentWallet = localStorage.getItem("tof_wallet")

// =====================
// TOF LIVE CONFIG
// =====================

const TOF_ASSET_ID = 3558306283
const ALGONODE_URL = "https://mainnet-api.algonode.cloud"

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
      a => Number(a["asset-id"]) === TOF_ASSET_ID
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
// GET USERNAME FROM URL
// =====================

const urlParams = new URLSearchParams(window.location.search)
const profileUsername = urlParams.get("u") // <--- Menggunakan u=username di URL

// Menyiapkan variabel penampung ID wallet internal agar tidak bocor di URL
let targetProfileId = null

// =====================
// RANK SYSTEM
// =====================

// ===================== RANK SYSTEM (INTEGRASI TANGGA PANGKAT) =====================

function getRank(xp) {
  const lvl = getTofLevel(xp);
  
  if (lvl >= 91) return "🥇 ELITE";       // Level 91-100: Tahap Mastermind/Petapa
  if (lvl >= 31) return "🥈 SPECIALIST";  // Level 31-90: Tahap Ilmu Baku
  if (lvl >= 11) return "🥉 PRO";         // Level 11-30: Tahap Kontribusi & Validasi
  return "🌱 GROWER";                     // Level 1-10: Tahap Belajar & Adaptasi
}

function getTofLevel(xp) {
  xp = xp || 0;

  // 1. GROWER: Level 1 - 10 (XP: 0 - 2999)
  if (xp < 3000) {
    return Math.floor(xp / 300) + 1; 
  }
  
  // 2. PRO: Level 11 - 30 (XP: 3000 - 8999)
  if (xp < 9000) {
    const proXp = xp - 3000;
    return 11 + Math.floor(proXp / 300);
  }
  
  // 3. SPECIALIST: Level 31 - 90 (XP: 9000 - 32999)
  if (xp < 33000) {
    const specXp = xp - 9000;
    return 31 + Math.floor(specXp / 400); // Dibagi rentang 400 XP per level agar muat 60 tingkat
  }
  
  // 4. ELITE: Level 91 - 100 (XP: 33000+)
  const eliteXp = xp - 33000;
  const eliteLevel = 91 + Math.floor(eliteXp / 1000);
  return Math.min(eliteLevel, 100); // Dikunci maksimal di Level 100
}

// ==========================================
// 🟢 TAMBAHKAN KODE BARU INI DI SINI
// ==========================================
function generateProfileContext(profileData, recentPosts = []) {
  const rank = getRank(profileData.xp || 0);
  const lvl = getTofLevel(profileData.xp || 0);
  
  // Ambil maksimal 5 postingan terakhir, gabungkan jadi histori
  const riwayatTeks = recentPosts.slice(0, 5).map((post, index) => {
    const tgl = new Date(post.created_at).toLocaleDateString("id-ID");
    return `[Karya ${index + 1} - ${tgl}]: "${post.deskripsi_proses}"`;
  }).join("\n");

  // Gabungkan menjadi satu paket ingatan untuk AI
  return `
KONTEKS PROFIL PETANI:
- Username: @${profileData.username}
- Level/Rank: Level ${lvl} (${rank})
- Total Asset: ${profileData.saldo_tof || 0} TOF / ${profileData.xp || 0} XP

REKAM JEJAK / KARYA TERAKHIR:
${riwayatTeks || "- Belum ada catatan karya sebelumnya di ladang."}
  `.trim();
}
// =====================
// LOAD PROFILE BALANCE
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

// =====================
// LOAD PROFILE (DENGAN AUTO-FALLBACK PROFIL SENDIRI)
// =====================

// =====================
// LOAD PROFILE (DENGAN SINKRONISASI COCOK DUA PARAMETER: USERNAME / WALLET ID)
// =====================

async function loadProfile() {

  let queryField = "username"
  let queryValue = profileUsername

  // 1. Ambil parameter id (alamat wallet) langsung dari URL browser jika ada
  const urlWalletId = urlParams.get("id")

  // 2. Jalankan logika penyaringan dinamis agar tautan lama (?id=) tetap terbuka mulus
  if (urlWalletId) {
    queryField = "id"
    queryValue = urlWalletId
  } 
 // 3. Jika parameter u maupun id kosong di URL, gunakan fallback ke dompet lokal yang sedang login
  else if (!profileUsername) {
    if (currentWallet) {
      queryField = "id"
      queryValue = currentWallet
    } else {
      // 🟢 PERBAIKAN: Jika ada parameter ?post di halaman beranda, jangan ganti HTML profil jadi error
      if (urlParams.get("post")) {
        console.log("Membuka postingan spesifik dari beranda...");
        return; // Hentikan fungsi loadProfile dengan aman tanpa memunculkan teks error
      }

      document.getElementById("profile").innerHTML = `
        <div class="card" style="text-align:center; color:#6f7f76;">
          🌿 Silakan sambungkan dompet Anda terlebih dahulu atau gunakan tautan profil petani yang valid.
        </div>
      `
      return
    }
  }

  // Cari data profil ke Supabase secara dinamis tanpa membocorkan data sensitif
  const { data, error } =
    await supabaseClient
      .from("profiles")
      .select("*")
      .eq(queryField, queryValue)
      .single()

  if (error || !data) {
    document.getElementById("profile").innerHTML = `
      <div class="card" style="text-align:center; color:#6f7f76;">
        Profil tidak ditemukan di ladang ToFarmer
      </div>
    `
    console.log(error)
    return
  }

  // Isi ID dompet internal ke memori RAM aplikasi (Aman, tersembunyi dari browser)
  targetProfileId = data.id

// ==========================================================================
  // 🟢 PROSES PENYEMBUNYIAN (URL MASKING)
  // ==========================================================================
  // Jika pengunjung masuk lewat tautan lama (?id=J36...), langsung bersihkan URL-nya
  if (urlWalletId) {
    // Ubah tampilan URL di browser menjadi berbasis username (?u=nama_user) yang jauh lebih rapi
    const cleanUrl = `${window.location.pathname}?u=${data.username}`
    window.history.replaceState({}, document.title, cleanUrl)
  }
  // ==========================================================================


  renderProfileData(data)
  document.title = `@${data.username} | Profil ToFarmer`
  renderWorkspace()
  loadUserPosts()
// ==========================================
// 🔄 GANTI SETTIMEOUT LAMA DENGAN BLOK INI
// ==========================================
  setTimeout(async () => {
    const responseBox = document.getElementById("ai-response");
    if (responseBox) {
      responseBox.innerText = "Teman Kebun sedang mengingat riwayat ladangmu...";
      
      // Ambil 5 data kontribusi terakhir dari Supabase untuk ingatan AI
      const { data: recentPosts } = await supabaseClient
        .from("contributions")
        .select("deskripsi_proses, created_at")
        .eq("user_id", targetProfileId)
        .eq("is_private", true)
        .order("created_at", { ascending: false })
        .limit(5);

      // Satukan data profil dan postingan terakhir menggunakan fungsi Langkah 1
      const konteksRAG = generateProfileContext(data, recentPosts);

      const sapaan = await panggilAiSaran("Evaluasi", { 
        teks: "User baru saja masuk ke halaman profil.", 
        trigger: `Kamu asisten petani jujur. Evaluasi progres berdasarkan data riwayat berikut:\n${konteksRAG}` 
      });
      
      typeWriterEffect(responseBox, `🤖 Teman Kebun: ${sapaan}`);
    }
  }, 1500); 
// ==========================================
  try {
    const liveBalance =
      await getWalletTofBalance(targetProfileId)

    data.saldo_tof = liveBalance

    renderProfileData(data)

    await supabaseClient
      .from("profiles")
      .update({
        saldo_tof: liveBalance
      })
      .eq("id", targetProfileId)

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
// WORKSPACE (UPDATED)
// =====================

function renderWorkspace() {
  const box = document.getElementById("profileWorkspace")


  // Sinkronisasi hak akses
  if (currentWallet !== targetProfileId) {
    box.innerHTML = ""
    return
  }

  box.innerHTML = `
    <div class="card">
      <div style="display: flex; gap: 10px; margin-bottom: 20px;">
        <button class="btn-glow" onclick="openQrisPopup()" style="padding:10px; font-size:11px; width:50%; margin:0; background:linear-gradient(90deg, #4caf7a, #c9a227); border:none; border-radius:12px; color:white; cursor:pointer;">💰 Nabung Ladang</button>
        <a href="https://www.tofarmer.xyz/html/dashboard.html" class="btn-glow" style="text-decoration:none; padding:10px; font-size:11px; width:50%; margin:0; background:linear-gradient(90deg, #4caf7a, #c9a227); border:none; border-radius:12px; color:white; text-align:center; display:flex; align-items:center; justify-content:center;">💡 Sumbang Ilmu (versi uji coba)</a>
      </div>

      <div id="ai-card-wrapper" style="margin-bottom:20px; border-top:1px solid #eee; padding-top:15px;">
        <div style="font-weight:700;color:#2f6f4e;margin-bottom:10px; font-size:13px;">🤖 Asisten Teman Kebun</div>
        <div id="ai-response" style="font-size:13px; color:#444; margin-bottom:10px; font-style: italic;">
          <em>Tanam karya dulu, nanti saya temani ngobrol...</em>
        </div>
        <div id="ai-chat-area" style="display:none;">
          <input id="ai-input" placeholder="Balas teman..." style="width:100%; padding:8px; border-radius:8px; border:1px solid #ddd; margin-bottom:5px;">
          <button class="btn-glow" onclick="kirimChatAI()" style="width:100%; margin:0; font-size:11px;">Balas (Sisa: <span id="sisa-chat">3</span>)</button>
        </div>
      </div>
      
      <div style="font-weight:700;color:#2f6f4e;margin-bottom:5px;">🌿 Ruang Karya Saya</div>
      <textarea id="profilePostBox" placeholder="Apa ide, progres, atau eksperimen hari ini?" style="width:100%;min-height:100px;padding:14px;border-radius:16px;border:2px solid rgba(76,175,122,.12);resize:none;outline:none;"></textarea>
      <input type="file" id="profileImage" accept="image/*" style="width:100%; margin-top:10px; margin-bottom:10px; font-size:12px;" />
      <button class="btn-glow" onclick="sendProfilePost()">🌱 TANAM KARYA</button>
    </div>
  `
}
let aiChatCounter = 0;
// =====================
// SEND PROFILE POST
// =====================

async function sendProfilePost() {
    const input = document.getElementById("profilePostBox");
    const imageInput = document.getElementById("profileImage");
    const text = input.value.trim();
    const file = imageInput.files[0];

    if (!text && !file) return alert("Isi teks atau pilih gambar 😄");

    // 1. Upload & Insert (Proses Supabase)
    let imageUrl = null;
    if (file) {
        const fileName = `${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabaseClient.storage
            .from("profile-posts")
            .upload(fileName, file);

        if (uploadError) return alert("Upload gambar gagal");
        const { data } = supabaseClient.storage.from("profile-posts").getPublicUrl(fileName);
        imageUrl = data.publicUrl;
    }

    const { error } = await supabaseClient.from("contributions").insert([{
        user_id: currentWallet,
        judul_aksi: "Profile Post",
        deskripsi_proses: text,
        image_url: imageUrl,
        status_validasi: "pending",
        is_private: true
    }]);

    if (error) return alert("Gagal kirim");

    input.value = "";
    imageInput.value = "";
    alert("🌿 Karya ditanam");

    // 2. Refresh UI
    await loadUserPosts();

 // ==========================================
// 🔄 GANTI BLOK TRIGGER AI LAMA DENGAN INI
// ==========================================
    // 3. Trigger AI dengan Memori Komunitas (RAG)
    const responseBox = document.getElementById("ai-response");
    const aiChatArea = document.getElementById("ai-chat-area");
    
    responseBox.innerText = "Teman Kebun sedang menganalisis karya barumu...";
    
    // Ambil data profil terbaru untuk memastikan XP/TOF akurat
    const { data: currentProfile } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", currentWallet)
        .single();

    // Ambil semua postingan termasuk yang baru saja masuk
    const { data: allPosts } = await supabaseClient
        .from("contributions")
        .select("deskripsi_proses, created_at")
        .eq("user_id", currentWallet)
        .eq("is_private", true)
        .order("created_at", { ascending: false });

    // Lewati indeks ke-0 (karena indeks 0 adalah postingan yang baru saja kita ketik)
    const riwayatLama = allPosts.slice(1); 
    const konteksRAG = generateProfileContext(currentProfile, riwayatLama);

    const komentarLucu = await panggilAiSaran("Evaluasi", { 
        teks: text, 
        trigger: `User baru saja menanam karya baru: "${text}". Hubungkan analisis/pujian/kritikmu dengan rekam jejak masa lalunya di bawah ini:\n${konteksRAG}` 
    });
    
    typeWriterEffect(responseBox, `🤖 Teman Kebun: ${komentarLucu}`);
    
    aiChatCounter = 0; 
    setTimeout(() => {
        aiChatArea.style.display = "block";
        const sisa = document.getElementById("sisa-chat");
        if (sisa) sisa.innerText = 3;
    }, 2000);
}

async function panggilAiSaran(mode, payload) {
    try {
        const response = await fetch("https://tofarmer-api.tofarmer-api.workers.dev/ai-saran", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mode: "Evaluasi", 
                teks: payload.teks,
                trigger: payload.trigger
            })
        });
        const data = await response.json();
        return data.saran;
    } catch (e) {
        console.error("AI sibuk:", e);
        return "Lagi sibuk nyangkul nih, coba nanti lagi ya!";
    }
}

async function kirimChatAI() {
    const input = document.getElementById("ai-input");
    const responseBox = document.getElementById("ai-response");
    const btn = document.querySelector("#ai-chat-area button");
    const text = input ? input.value.trim() : "";

    if (!text && aiChatCounter < 3) return;
    if (btn) btn.disabled = true;

    if (aiChatCounter >= 3) {
        if (document.getElementById("ai-chat-area")) document.getElementById("ai-chat-area").style.display = "none";
        if (responseBox) responseBox.innerText = "🤖 Teman Kebun: Sudah 3 ronde! Saya balik nyangkul dulu ya... (Tanam karya baru lagi jika ingin mengobrol kembali)";
        return;
    }
    
    if (responseBox) responseBox.innerText = "Teman Kebun sedang merangkai kata...";
    
    try {
        const jawaban = await panggilAiSaran("Evaluasi", { teks: text, trigger: "Balas chat user" });
        
        aiChatCounter++;
        // Gunakan efek ketik untuk hasil respon
        typeWriterEffect(responseBox, `🤖 Teman Kebun: ${jawaban}`);
        
        input.value = "";
        
        // Update counter
        const sisa = document.getElementById("sisa-chat");
        if (sisa) sisa.innerText = 3 - aiChatCounter;

       // ==========================================
// 🔄 GANTI BAGIAN IF INI
// ==========================================
        if (aiChatCounter >= 3) {
            document.getElementById("ai-chat-area").style.display = "none";
            responseBox.innerText = "🤖 Teman Kebun: Sudah 3 ronde! Saya balik nyangkul dulu ya... (Tanam karya baru lagi untuk ngobrol lagi)";
        }
// ==========================================
    } catch (err) {
        responseBox.innerText = "🤖 Teman Kebun: Maaf, saya lagi kurang enak badan (Error API).";
    } finally {
        if (btn) btn.disabled = false;
    }
}
// =====================
// USER POSTS (FIXED META TAG SYNC)
// =====================

async function loadUserPosts() {
  const box = document.getElementById("userPosts")
  if (!targetProfileId) return

  const { data, error } = await supabaseClient
    .from("contributions")
    .select(`
      *,
      profiles(username)
    `)
    .eq("user_id", targetProfileId)
    .eq("is_private", true)
    .order("created_at", { ascending: false })

  if (!data?.length) {
    box.innerHTML = `<div class="card" style="text-align:center;color:#888;">Belum ada karya 🌱</div>`
    return
  }

  try {
    const postIdParam = urlParams.get("post");

    if (postIdParam) {
      const matchedPost = data.find(p => p.id === postIdParam || String(p.id) === String(postIdParam));
      
      if (matchedPost) {
        const petikTeks = matchedPost.deskripsi_proses ? matchedPost.deskripsi_proses.substring(0, 100) + "..." : "Intip progres kebun karya di ToFarmer.";
        const namaPetani = matchedPost.profiles?.username || "Petani";

        document.title = `Karya @${namaPetani} | ToFarmer`;
        
        const metaDesc = document.getElementById("postDesc");
        const ogTitle = document.getElementById("ogTitle");
        const ogDesc = document.getElementById("ogDesc");
        const ogImage = document.getElementById("ogImage");

        if (metaDesc) metaDesc.setAttribute("content", petikTeks);
        if (ogTitle) ogTitle.setAttribute("content", `🌿 Catatan Karya @${namaPetani}`);
        if (ogDesc) ogDesc.setAttribute("content", petikTeks);
        
        if (matchedPost.image_url && ogImage) {
          ogImage.setAttribute("content", matchedPost.image_url);
        }
      }
    }
  } catch (metaErr) {
    console.log("Gagal memperbarui Meta Tag di Profil:", metaErr);
  }

 box.innerHTML = data.map(post => {
    const date = new Date(post.created_at).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })

    const safeText = (post.deskripsi_proses || "").replace(/`/g, "\\`").replace(/\$/g, "\\$");
    const currentUsername = profileUsername || "Petani";

    return `
      <div id="post-card-${post.id}" class="card" style="margin-bottom:14px;">

        <div style="font-size:11px;color:#6f7f76;margin-bottom:6px;">
          🌿 ${date}
        </div>

        <div style="font-size:13px;line-height:1.7;margin-bottom:10px;">
          ${post.deskripsi_proses || ""}
        </div>

        ${
          post.image_url
            ? `
              <div style="width:100%;display:flex;justify-content:center;margin-bottom:12px;">
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
          <span onclick="reactPost('${post.id}','sruput')" style="cursor:pointer;">
            ☕ ${post.sruput_count || 0} Sruput
          </span>

          <span onclick="reactPost('${post.id}','cangkul')" style="cursor:pointer;">
            ⛏️ ${post.cangkul_count || 0} Cangkul
          </span>
        </div>

        <div class="post-actions">
          <button class="share-btn" onclick="sharePost('${post.id}', '${currentUsername}', '${encodeURIComponent(safeText)}')">
            📢 Bagikan Karya
          </button>
        </div>

        <div style="margin-top: 10px; margin-bottom: 10px; font-size: 12px;">
          <span id="comment-count-${post.id}" onclick="toggleCommentBox('${post.id}')" style="cursor:pointer; color:#2f6f4e; font-weight:600; user-select:none;">
            💬 Memuat jumlah komentar...
          </span>
        </div>

        <div id="commentWrapper-${post.id}" style="display: none; border-top: 1px dashed #ddd; padding-top: 10px; margin-top: 5px;">
          
          <div id="commentBox-${post.id}" style="font-size:12px; color:#444; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px;"></div>
          
          <div style="display:flex; gap:6px;">
            <input id="cmt-${post.id}" placeholder="Tulis komentar..." style="flex:1; padding:8px; border-radius:10px; border:1px solid #ddd; font-size:12px; box-sizing:border-box;" />
            <button type="button" class="btn-glow" onclick="sendComment('${post.id}')" style="margin:0; padding:8px 14px; font-size:12px; width:auto;">Kirim</button>
          </div>

        </div>

      </div>
    `
  }).join("")

  // 1. Tetap jalankan update counter jumlah komentar secara paralel
  setTimeout(() => data.forEach(p => updateCommentCount(p.id)), 0)

  // 🟢 2. FITUR AUTO-SCROLL ANCHORING DARI TAUTAN BAGIKAN KARYA
  setTimeout(async () => {
    const postIdParam = urlParams.get("post");
    if (postIdParam) {
      // Cari kartu postingan fisik di layar DOM
      const targetCard = document.getElementById(`post-card-${postIdParam}`);
      if (targetCard) {
        // A. Otomatis buka kotak komentar agar pengguna langsung diarahkan berdiskusi
        await toggleCommentBox(postIdParam);
        
        // B. Gulirkan layar komputer/HP menuju koordinat postingan tersebut secara halus (smooth)
        targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
        
        // C. Berikan efek highlight kilasan hijau tipis agar pengguna tahu postingan mana yang sedang disorot
        targetCard.style.transition = "all 0.5s ease";
        targetCard.style.boxShadow = "0 0 15px rgba(47, 111, 78, 0.35)";
        targetCard.style.borderColor = "#2f6f4e";
      }
    }
  }, 300); // Diberi jeda 300ms agar browser selesai menyusun HTML kartu terlebih dahulu
}

// =====================
// REACTION
// =====================

let reacting = false; // Ini gembok pintu depan

async function reactPost(postId, type) {
  // 🟢 CEK LOGIN: Jika tidak ada wallet di localStorage, hentikan dan beri tahu user
  if (!currentWallet) {
    alert("🌿 Sambungkan dompet dulu untuk apresiasi karya ini!");
    return;
  }

  // 1. Jika pintu sedang terkunci, abaikan klik selanjutnya!
  if (reacting) return;
  reacting = true; // Kunci pintu sekarang!

  try {
    // Ambil data postingan terbaru
    const { data: post, error: fetchErr } = await supabaseClient
      .from("contributions")
      .select("*")
      .eq("id", postId)
      .single();

    if (fetchErr || !post) return;

    // Pemilik postingan tidak boleh klik karyanya sendiri
    if (post.user_id === currentWallet) {
      alert("Tidak bisa reaction di karya sendiri 😄");
      reacting = false;
      return;
    }

    // 2. Cek apakah di database sudah pernah ada riwayat klik dari dompet ini
    const { data: existing } = await supabaseClient
      .from("reactions")
      .select("*")
      .eq("post_id", postId)
      .eq("user_id", currentWallet)
      .maybeSingle();

    if (existing) {
      alert("Anda sudah memberikan apresiasi pada karya ini 🌱");
      reacting = false;
      return;
    }

    // 3. Daftarkan dulu ke tabel 'reactions'. 
    // Jika gagal (karena dicegat gembok database), kode di bawahnya tidak akan jalan.
    const { error: insertErr } = await supabaseClient
      .from("reactions")
      .insert([{ post_id: postId, user_id: currentWallet, type }]);

    if (insertErr) {
      console.log("Gagal, data sudah ada di database.");
      reacting = false;
      return;
    }

  // 4. Jika pendaftaran sukses, baru tambahkan angka +1
    await supabaseClient
      .from("contributions")
      .update({
        [type === "sruput" ? "sruput_count" : "cangkul_count"]:
          (post[type === "sruput" ? "sruput_count" : "cangkul_count"] || 0) + 1
      })
      .eq("id", postId);

    // 🟢 KUNCI KOORDINAT: Catat posisi scroll aktual kartu sebelum UI digambar ulang
    const targetCard = document.getElementById(`post-card-${postId}`);
    const koordinatY = targetCard ? targetCard.getBoundingClientRect().top + window.scrollY : 0;

    // Muat ulang tampilan agar angka berubah di layar browser
    await loadUserPosts();

    // 🟢 KEMBALIKAN POSISI: Kembalikan posisi scroll ke koordinat semula secara presisi
    if (koordinatY) {
      window.scrollTo({
        top: koordinatY - 40, // Beri sedikit kelonggaran batas atas sebesar 40px agar nyaman di mata
        behavior: "auto"      // 'auto' mengunci posisi secara instan tanpa animasi geser kasat mata
      });
    }

  } catch (err) {
    console.error("Terjadi kesalahan:", err);
  } finally {
    // 5. Apapun yang terjadi (sukses atau error), buka kembali gembok pintu depan
    reacting = false;
  }
}

// =====================
// COMMENTS
// =====================

async function sendComment(postId) {
  const input = document.getElementById("cmt-" + postId)
  const text = input.value.trim()

  // Skenario proteksi jika user belum login/connect wallet
  if (!currentWallet) {
    alert("🌿 Sambungkan dompet dulu untuk ikut berdiskusi!");
    return
  }

  if (!text) return

  await supabaseClient.from("comments").insert([{
    post_id: postId,
    user_id: currentWallet,
    comment: text
  }])

  // 🟢 KUNCI KOORDINAT: Simpan posisi kartu sebelum memproses pembaruan komponen internal
  const targetCard = document.getElementById(`post-card-${postId}`);
  const koordinatY = targetCard ? targetCard.getBoundingClientRect().top + window.scrollY : 0;

  input.value = ""
  
  // Refresh data list komentar & update jumlah angka notifikasinya
  await loadComments(postId)
  await updateCommentCount(postId)

  // 🟢 KEMBALIKAN POSISI: Pertahankan letak koordinat box agar tidak meloncat
  if (koordinatY) {
    window.scrollTo({
      top: koordinatY - 40,
      behavior: "auto"
    });
  }
}

// Fungsi Load Komentar Baru: Mengambil data teks sekaligus Profil Pengomentar
async function loadComments(postId) {

  // 1. ambil comments saja
  const { data: comments, error } = await supabaseClient
    .from("comments")
    .select("*")
    .eq("post_id", Number(postId))
    .order("created_at", { ascending: false });

  const box = document.getElementById("commentBox-" + postId);

  if (!box || error) {
    console.error("Gagal memuat komentar:", error);
    return;
  }

  if (!comments || comments.length === 0) {
    box.innerHTML = "<p>Belum ada komentar</p>";
    return;
  }

  // 2. ambil semua user_id unik
  const userIds = [...new Set(comments.map(c => c.user_id))];

  // 3. ambil profiles berdasarkan user_id
  const { data: profiles } = await supabaseClient
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", userIds);

  // 4. mapping profiles ke object
  const profileMap = Object.fromEntries(
    (profiles || []).map(p => [p.id, p])
  );

  // 5. gabungkan data
  const merged = comments.map(c => ({
    ...c,
    profiles: profileMap[c.user_id] || null
  }));

 // 6. 🔥 INI DIA YANG KAMU TANYA → RENDER KE UI
 box.innerHTML = merged.map(c => {
  const user = c.profiles?.username || "Pengunjung";
  const avatar = c.profiles?.avatar_url || "/aset/favicon.png";

  const time = new Date(c.created_at).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });

  return `
    <div style="
      display: flex;
      gap: 10px;
      padding: 10px 0;
      border-bottom: 1px solid #eee;
    ">

      <!-- AVATAR -->
      <img src="${avatar}" style="
        width: 38px;
        height: 38px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
      " />

      <!-- CONTENT -->
      <div style="flex: 1;">

        <!-- HEADER (username + time) -->
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 3px;
        ">

          <div style="
            font-weight: 700;
            font-size: 13px;
            color: #2f6f4e;
          ">
            @${user}
          </div>

          <div style="
            font-size: 11px;
            color: #999;
          ">
            ${time}
          </div>

        </div>

        <!-- COMMENT TEXT -->
        <div style="
          font-size: 13px;
          color: #222;
          line-height: 1.4;
          white-space: pre-wrap;
        ">
          ${c.comment}
        </div>

      </div>
    </div>
  `;
}).join("");
}

  

// FUNGSI BARU: Hanya menghitung total baris komentar dari database Supabase
async function updateCommentCount(postId) {
  const { count, error } = await supabaseClient
    .from("comments")
    .select("*", { count: "exact", head: true })
    .eq("post_id", postId)

  const countEl = document.getElementById(`comment-count-${postId}`)
  if (countEl && !error) {
    countEl.innerText = `💬 ${count || 0} Komentar`;
  }
}

// FUNGSI BARU: Mekanisme buka-tutup box (Klik jumlah komentar -> Baru panggil API & Munculkan)
async function toggleCommentBox(postId) {
  const wrapper = document.getElementById(`commentWrapper-${postId}`)
  if (!wrapper) return

  if (wrapper.style.display === "none") {
    // Saat dibuka, jalankan fungsi penarik data terbaru
    await loadComments(postId)
    wrapper.style.display = "block"
  } else {
    // Saat diklik lagi, sembunyikan kembali
    wrapper.style.display = "none"
  }
}

// =====================
// REALTIME SYNC
// =====================

setInterval(async () => {
  if (!targetProfileId) return

  const liveBalance = await getWalletTofBalance(targetProfileId)

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

  alert("🌿 Konfirmasi admin lewat WA ya...")
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
let typewriterTimeout = null; // Tambahkan variabel global ini

function typeWriterEffect(element, text, speed = 20) {
    // 1. Hentikan animasi yang sedang berjalan
    if (typewriterTimeout) clearTimeout(typewriterTimeout);
    
    element.innerHTML = ""; 
    let i = 0;
    
    function type() {
        if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            typewriterTimeout = setTimeout(type, speed);
        }
    }
    type();
}
function sharePost(postId, username, text) {
  // 1. Susun URL unik yang mengarah langsung ke postingan ini di halaman profil
  // Menggunakan window.location.origin + pathname agar dinamis baik di lokal maupun domain live
  const shareUrl = `${window.location.origin}${window.location.pathname}?u=${username}&post=${postId}`;

  // 2. Gunakan Clipboard API bawaan browser untuk menyalin tautan
  navigator.clipboard.writeText(shareUrl).then(() => {
    alert(`📢 Tautan karya @${username} berhasil disalin! Siap dibagikan ke komunitas 🌱\n\nLink: ${shareUrl}`);
  }).catch((err) => {
    console.error("Gagal menyalin tautan:", err);
    // Fallback manual jika browser memblokir clipboard API
    alert(`Salin tautan ini secara manual:\n${shareUrl}`);
  });
}
// ==========================================================================
  // 🟢 AUTO-SCROLL ANCHORING DARI LINK YANG DIBAGIKAN DI BERANDA UTAMA
  // ==========================================================================
  setTimeout(async () => {
    const postIdParam = urlParams.get("post");
    if (postIdParam) {
      // Cari kartu postingan fisik berdasarkan ID unik yang kita buat di Langkah awal kemarin
      const targetCard = document.getElementById(`post-card-${postIdParam}`);
      if (targetCard) {
        // Otomatis buka kotak komentar di beranda
        if (typeof toggleKomentarBox === "function") {
          await toggleKomentarBox(postIdParam);
        }
        
        // Gulirkan layar ke koordinat kartu secara halus
        targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
        
        // Beri efek highlight visual penanda hijau
        targetCard.style.transition = "all 0.5s ease";
        targetCard.style.boxShadow = "0 0 15px rgba(47, 111, 78, 0.35)";
        targetCard.style.borderColor = "#2f6f4e";
      }
    }
  }, 500); // Diberi jeda 500ms agar data Supabase beranda selesai dirender utuh ke layar DOM