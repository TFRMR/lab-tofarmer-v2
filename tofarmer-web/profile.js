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
      if (urlParams.get("post")) {
        console.log("Membuka postingan spesifik dari beranda...");
        return; 
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

  // Jika pengunjung masuk lewat tautan lama (?id=J36...), langsung bersihkan URL-nya
  if (urlWalletId) {
    const cleanUrl = `${window.location.pathname}?u=${data.username}`
    window.history.replaceState({}, document.title, cleanUrl)
  }

  renderProfileData(data)
  document.title = `@${data.username} | Profil ToFarmer`
  renderWorkspace()
  loadUserPosts()

  setTimeout(() => {
    loadProfilIlmu();
  }, 800);

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
  try {
    const liveBalance = await getWalletTofBalance(targetProfileId)
    data.saldo_tof = liveBalance
    renderProfileData(data)

    await supabaseClient
      .from("profiles")
      .update({ saldo_tof: liveBalance })
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

      <div style="margin-top: 25px; text-align: left; border-top: 1px dashed #cbd5e1; padding-top: 15px;">
         <h3 style="font-size: 14px; color: #2f6f4e; margin-bottom: 10px;">🎓 Karya</h3>
         
         <div id="profil-ilmu-baku" style="margin-bottom: 15px;">
            <h4 style="font-size: 12px; color: #16a34a; margin-bottom: 5px;">📜 Ilmu Baku Sah</h4>
            <div class="area-baku-list">Memuat ilmu...</div>
         </div>

         <div id="profil-ilmu-pending">
            <h4 style="font-size: 12px; color: #f59e0b; margin-bottom: 5px;">⏳ Menunggu Persetujuan (Pending)</h4>
            <div class="area-pending-list">Memuat ilmu...</div>
         </div>
      </div>
    </div>
  `
}

// =====================
// WORKSPACE (UPDATED)
// =====================

function renderWorkspace() {
  const box = document.getElementById("profileWorkspace")

  if (currentWallet !== targetProfileId) {
    box.innerHTML = ""
    return
  }

  box.innerHTML = `
    <div class="card">
      <div style="display: flex; gap: 10px; margin-bottom: 20px;">
        <button class="btn-glow" onclick="openQrisPopup()" style="padding:10px; font-size:11px; width:50%; margin:0; background:linear-gradient(90deg, #4caf7a, #c9a227); border:none; border-radius:12px; color:white; cursor:pointer;">💰 Nabung Ladang</button>
        <a href="https://www.tofarmer.xyz/html/dashboard.html" class="btn-glow" style="text-decoration:none; padding:10px; font-size:11px; width:50%; margin:0; background:linear-gradient(90deg, #4caf7a, #c9a227); border:none; border-radius:12px; color:white; text-align:center; display:flex; align-items:center; justify-content:center;">💡 Sumbang Ilmu</a>
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

// ==========================================================================
// FUNGSI MEMUAT ILMU DAN VOTE KHUSUS HALAMAN PROFIL (FIXED NO LOADING)
// ==========================================================================

window.bukaDetailIlmuProfil = async function(idIlmu, tipeTabel) {
  try {
    const { data: item, error } = await supabaseClient
      .from(tipeTabel)
      .select("*")
      .eq("id", idIlmu)
      .single();

    if (error || !item) return alert("Gagal memuat detail ilmu.");

    const overlay = document.createElement('div');
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:99999; padding: 20px;";
    
    const isPending = (tipeTabel === "ilmu_pending");

    overlay.innerHTML = `
        <div style="background:#1e293b; padding:2rem; border-radius:1rem; width:90%; max-width:500px; border:1px solid #374151; color:white; text-align:left; max-height: 90vh; display: flex; flex-direction: column;">
            <div style="text-align:center; font-size:0.7rem; color:#94a3b8; margin-bottom:0.5rem; text-transform:uppercase; letter-spacing:0.1em;">
                ToFarmer - ${isPending ? 'Menunggu Konsensus' : 'Ilmu Baku Sah'}
            </div>
            <h2 style="color:#16a34a; text-align:center; margin-bottom:1rem; font-size:18px;">${item.judul_aksi}</h2>
            <div style="flex: 1; overflow-y: auto; margin-bottom: 1rem; padding-right: 10px;">
                <p style="color:#cbd5e1; white-space:pre-line; line-height:1.6; font-size:13px;">${item.deskripsi_proses}</p>
            </div>
            <div style="text-align:center; display: flex; gap: 10px; justify-content: center;">
                ${isPending ? `<button id="profil-vote-btn" style="background:#f59e0b; border:none; padding:10px 20px; color:black; border-radius:8px; cursor:pointer; font-weight:bold; font-size:12px;">👍 Vote (${item.total_vote || 0})</button>` : ''}
                <button id="profil-close-popup" style="background:#374151; border:none; padding:10px 30px; color:white; border-radius:8px; cursor:pointer; font-size:12px;">Tutup</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    if (isPending) {
        document.getElementById('profil-vote-btn').onclick = () => aksiVoteDariProfil(item);
    }
    document.getElementById('profil-close-popup').onclick = () => document.body.removeChild(overlay);
  } catch(e) {
    console.error(e);
  }
}

async function loadProfilIlmu() {
  if (!targetProfileId) return;

  const wadahBaku = document.querySelector("#profil-ilmu-baku .area-baku-list");
  const wadahPending = document.querySelector("#profil-ilmu-pending .area-pending-list");

  const { data: dataBaku } = await supabaseClient
    .from("ilmu_baku")
    .select("*")
    .eq("user_id", targetProfileId);

  if (wadahBaku) {
    if (dataBaku && dataBaku.length > 0) {
      wadahBaku.innerHTML = dataBaku.map(item => `
        <button onclick="window.bukaDetailIlmuProfil('${item.id}', 'ilmu_baku')" style="width:100%; margin:4px 0; padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #16a34a; color:#334155; border-radius:8px; cursor:pointer; text-align:left; font-size:12px;">
          <strong>📜 ${item.judul_aksi}</strong>
        </button>
      `).join("");
    } else {
      wadahBaku.innerHTML = `<p style="font-size:11px; color:#94a3b8; font-style:italic; margin:0;">Belum ada ilmu yang disahkan.</p>`;
    }
  }

  const { data: dataPending } = await supabaseClient
    .from("ilmu_pending")
    .select("*")
    .eq("user_id", targetProfileId);

  if (wadahPending) {
    if (dataPending && dataPending.length > 0) {
      wadahPending.innerHTML = dataPending.map(item => `
        <button onclick="window.bukaDetailIlmuProfil('${item.id}', 'ilmu_pending')" style="width:100%; margin:4px 0; padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #f59e0b; color:#334155; border-radius:8px; cursor:pointer; text-align:left; font-size:12px;">
          <strong>⏳ ${item.judul_aksi}</strong><br>
          <span style="font-size:10px; color:#f59e0b;">👍 ${item.total_vote || 0} Dukungan</span>
        </button>
      `).join("");
    } else {
      wadahPending.innerHTML = `<p style="font-size:11px; color:#94a3b8; font-style:italic; margin:0;">Tidak ada ilmu dalam antrean.</p>`;
    }
  }
}

async function aksiVoteDariProfil(item) {
    if (!currentWallet) {
        alert("Waduh, login/sambungkan dompet dulu ya untuk bisa memberikan dukungan!");
        return;
    }

    const { data: existingVote, error: voteError } = await supabaseClient
        .from('votes')
        .insert([{ ilmu_id: item.id, user_id: currentWallet }])
        .select();

    if (voteError) {
        alert("Wah, Kang sudah pernah memberikan dukungan untuk ilmu ini!");
        return;
    }

    const newVoteCount = (item.total_vote || 0) + 1;

    const { error: updateError } = await supabaseClient
        .from('ilmu_pending')
        .update({ total_vote: newVoteCount })
        .eq('id', item.id);

    if (updateError) {
        alert("Gagal mengupdate jumlah vote.");
        return;
    }

    if (newVoteCount >= 7) {
        const { error: insertError } = await supabaseClient
            .from('ilmu_baku')
            .insert([{
                user_id: item.user_id,
                judul_aksi: item.judul_aksi,
                deskripsi_proses: item.deskripsi_proses,
                total_vote: newVoteCount
            }]);

        if (!insertError) {
            await supabaseClient.from('ilmu_pending').delete().eq('id', item.id);
            alert("Mantap! Ilmu ini sudah lulus konsensus dan masuk Ilmu Baku!");
            location.reload();
        }
    } else {
        alert(`Dukungan berhasil! (Total: ${newVoteCount}/7)`);
        location.reload();
    }
}

// =========================================================================
// 🌿 FUNGSI UTAMA: SEND PROFILE POST (INTEGRASI DATABASE & AI TEMAN KEBUN)
// =========================================================================
async function sendProfilePost() {
  let imageUrl = null
  const input = document.getElementById("profilePostBox")
  const imageInput = document.getElementById("profileImage")
  if (!input) return

  const text = input.value.trim()
  if (!text) {
    alert("Deskripsi karya tidak boleh kosong, Kang! ☕");
    return;
  }

  let pilarAksiFinal = 1;
  try {
    if (typeof classifyPilar === "function") {
      const pilar = await classifyPilar(text);
      if (pilar && typeof PILAR_MAP !== "undefined" && PILAR_MAP[pilar]) {
        pilarAksiFinal = PILAR_MAP[pilar];
      }
    }
  } catch (errPilar) {
    console.log("Fungsi pencarian pilar dilewati:", errPilar.message);
  }

  const file = imageInput?.files?.[0] || null

  if (file instanceof File) {
    const fileName = `${currentWallet}-${Date.now()}-${file.name || "img"}`
    try {
      const { error: uploadError } = await supabaseClient.storage
        .from("post-images")
        .upload(fileName, file, { cacheControl: "3600", upsert: false })

      if (uploadError) throw uploadError;

      const { data } = supabaseClient.storage.from("post-images").getPublicUrl(fileName)
      if (!data?.publicUrl) {
        alert("Gagal mengambil URL gambar.");
        return;
      }
      imageUrl = data.publicUrl
    } catch (errUpload) {
      alert("Gagal mengunggah gambar: " + errUpload.message);
      return;
    }
  }

  const isSelfPost = true
  const xpBonus = 20

  const { data: dataBaru, error } = await supabaseClient
    .from("contributions")
    .insert([
      {
        user_id: currentWallet,
        pilar_aksi: pilarAksiFinal,
        judul_aksi: imageUrl ? "Berbagi Karya Foto" : "Feed Post",
        deskripsi_proses: text,
        image_url: imageUrl,             
        status_validasi: "PENDING",       
        xp_reward: xpBonus,
        is_self_post: isSelfPost,
        is_private: false 
      }
    ])
    .select();

  if (error) {
    alert("Gagal menanam karya: " + error.message)
    return
  }

  alert("Karya berhasil ditanam di ladang! 🌱🎨");

  try {
    const { data: semuaUser } = await supabaseClient
      .from("profiles")
      .select("id");

    if (semuaUser && semuaUser.length > 0 && dataBaru && dataBaru[0]) {
      const daftarNotif = semuaUser
        .filter(u => u.id !== currentWallet) 
        .map(u => ({
          user_id: u.id,                       
          sender_id: currentWallet,             
          type: 'mention', 
          message: imageUrl 
            ? `baru saja membagikan foto karya baru di profilnya! 🎨` 
            : `baru saja membagikan catatan perkembangan baru di profilnya! 📝`,
          related_id: dataBaru[0].id,               
          is_read: false
        }));

      if (daftarNotif.length > 0) {
        await supabaseClient
          .from("notifications")
          .insert(daftarNotif);
      }
    }
  } catch (errNotif) {
    console.log("Notifikasi massal dilewati:", errNotif.message);
  }

  if (currentProfile) {
    const newXP = (currentProfile.xp || 0) + xpBonus
    const { error: xpError } = await supabaseClient
      .from("profiles")
      .update({ xp: newXP })
      .eq("id", currentWallet)

    if (!xpError) {
      currentProfile.xp = newXP
    }
  }

  input.value = ""
  if (imageInput) imageInput.value = ""

  await loadUserPosts() 

  const responseBox = document.getElementById("ai-response");
  const aiChatArea = document.getElementById("ai-chat-area");
  
  if (responseBox && aiChatArea) {
    responseBox.innerText = "Teman Kebun sedang menganalisis karya barumu...";
    
    const { data: latestProfile } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", currentWallet)
        .single();

    const { data: allPosts } = await supabaseClient
        .from("contributions")
        .select("deskripsi_proses, created_at")
        .eq("user_id", currentWallet)
        .order("created_at", { ascending: false });

    const riwayatLama = allPosts ? allPosts.slice(1) : []; 
    
    if (typeof generateProfileContext === "function" && typeof panggilAiSaran === "function") {
      const konteksRAG = generateProfileContext(latestProfile || currentProfile, riwayatLama);

      const komentarLucu = await panggilAiSaran("Evaluasi", { 
          teks: text, 
          trigger: `User baru saja menanam karya baru: "${text}". Hubungkan analisis/pujian/kritikmu dengan rekam jejak masa lalunya:\n${konteksRAG}` 
      });
      
      try {
        if (typeof typeWriterEffect === "function") {
          typeWriterEffect(responseBox, `🤖 Teman Kebun: ${komentarLucu}`);
        } else {
          responseBox.innerText = `🤖 Teman Kebun: ${komentarLucu}`;
        }

        let aiChatCounter = 0;

        setTimeout(() => {
          if (aiChatArea) aiChatArea.style.display = "block";
          const sisa = document.getElementById("sisa-chat");
          if (sisa) sisa.innerText = 3;
        }, 2000);

        if (aiChatCounter >= 3) {
          document.getElementById("ai-chat-area").style.display = "none";
          responseBox.innerText = "🤖 Teman Kebun: Sudah 3 ronde! Saya balik nyangkul dulu ya...";
        }

      } catch (err) {
        console.log("AI error:", err);
        responseBox.innerText = "🤖 Teman Kebun: Lagi nyangkul, coba lagi nanti ya.";
      } 
    }
  }
}

// =====================
// USER POSTS (FIXED META TAG SYNC)
// =====================

async function loadUserPosts() {
  const box = document.getElementById("userPosts")
  if (!targetProfileId || !box) return

  const { data, error } = await supabaseClient
    .from("contributions")
    .select(`
      *,
      profiles(username)
    `)
    .eq("user_id", targetProfileId) 
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
    const isMyPost = currentWallet === targetProfileId;

    return `
      <div id="post-card-${post.id}" class="card" style="margin-bottom:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; margin-bottom:6px;">
          <div style="font-size:11px;color:#6f7f76;">
            🌿 ${date}
          </div>

          ${isMyPost ? `
          <div class="post-menu-container" style="position: relative; display: inline-block;">
            <button class="btn-dot-menu" onclick="toggleDotMenu('${post.id}')" style="background:none; border:none; color:#65676b; font-size:16px; cursor:pointer; padding:2px 6px;">•••</button>
            <div class="dot-dropdown" id="dropdown-${post.id}" style="display:none; position:absolute; right:0; top:20px; background:white; box-shadow:0 2px 12px rgba(0,0,0,0.15); border-radius:8px; z-index:100; min-width:160px; border:1px solid #e4e6eb; padding:4px 0;">
              <button onclick="aksiEditPostingan('${post.id}', \`${safeText}\`)" style="width:100%; text-align:left; background:none; border:none; padding:8px 12px; font-size:12px; color:#050505; cursor:pointer;">✏️ Edit Postingan</button>
              <button onclick="aksiKembalikanKeBeranda('${post.id}')" style="width:100%; text-align:left; background:none; border:none; padding:8px 12px; font-size:12px; color:#050505; cursor:pointer;">🌍 Tampilkan di Beranda</button>
            </div>
          </div>
          ` : ''}
        </div>

        <div style="font-size:13px;line-height:1.7;margin-bottom:10px;">
          ${convertMentions(post.deskripsi_proses || "")}
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

  setTimeout(() => data.forEach(p => updateCommentCount(p.id)), 0)

  setTimeout(async () => {
    const postIdParam = urlParams.get("post");
    if (postIdParam) {
      const targetCard = document.getElementById(`post-card-${postIdParam}`);
      if (targetCard) {
        await toggleCommentBox(postIdParam);
        targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
        targetCard.style.transition = "all 0.5s ease";
        targetCard.style.boxShadow = "0 0 15px rgba(47, 111, 78, 0.35)";
        targetCard.style.borderColor = "#2f6f4e";
      }
    }
  }, 300); 
}

// =====================
// REACTION
// =====================

let reacting = false; 

async function reactPost(postId, type) {
  if (!currentWallet) {
    alert("🌿 Sambungkan dompet dulu untuk apresiasi karya ini!");
    return;
  }

  if (reacting) return;
  reacting = true; 

  try {
    const { data: post, error: fetchErr } = await supabaseClient
      .from("contributions")
      .select("*")
      .eq("id", postId)
      .single();

    if (fetchErr || !post) return;

    if (post.user_id === currentWallet) {
      alert("Tidak bisa reaction di karya sendiri 😄");
      reacting = false;
      return;
    }

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

    const { error: insertErr } = await supabaseClient
      .from("reactions")
      .insert([{ post_id: postId, user_id: currentWallet, type }]);

    if (insertErr) {
      console.log("Gagal, data sudah ada di database.");
      reacting = false;
      return;
    }

    await supabaseClient
      .from("contributions")
      .update({
        [type === "sruput" ? "sruput_count" : "cangkul_count"]:
          (post[type === "sruput" ? "sruput_count" : "cangkul_count"] || 0) + 1
      })
      .eq("id", postId);

    const targetCard = document.getElementById(`post-card-${postId}`);
    const koordinatY = targetCard ? targetCard.getBoundingClientRect().top + window.scrollY : 0;

    await loadUserPosts();

    if (koordinatY) {
      window.scrollTo({
        top: koordinatY - 40, 
        behavior: "auto"      
      });
    }

  } catch (err) {
    console.error("Terjadi kesalahan:", err);
  } finally {
    reacting = false;
  }
}

// =====================
// COMMENTS
// =====================

async function sendComment(postId) {
  const input = document.getElementById("cmt-" + postId)
  const text = input.value.trim()

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

  const targetCard = document.getElementById(`post-card-${postId}`);
  const koordinatY = targetCard ? targetCard.getBoundingClientRect().top + window.scrollY : 0;

  input.value = ""
  
  await loadComments(postId)
  await updateCommentCount(postId)

  if (koordinatY) {
    window.scrollTo({
      top: koordinatY - 40,
      behavior: "auto"
    });
  }
}

async function loadComments(postId) {
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

  const userIds = [...new Set(comments.map(c => c.user_id))];

  const { data: profiles } = await supabaseClient
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", userIds);

  const profileMap = Object.fromEntries(
    (profiles || []).map(p => [p.id, p])
  );

  const merged = comments.map(c => ({
    ...c,
    profiles: profileMap[c.user_id] || null
  }));

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
      <div style="display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid #eee;">
        <img src="${avatar}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" />
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
            <div style="font-weight: 700; font-size: 13px; color: #2f6f4e;">@${user}</div>
            <div style="font-size: 11px; color: #999;">${time}</div>
          </div>
          <div style="font-size: 13px; color: #222; line-height: 1.4;">
            ${convertMentions(c.comment || "")}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

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

async function toggleCommentBox(postId) {
  const wrapper = document.getElementById(`commentWrapper-${postId}`)
  if (!wrapper) return

  if (wrapper.style.display === "none") {
    await loadComments(postId)
    wrapper.style.display = "block"
  } else {
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
    <div style="background:white;padding:20px;border-radius:166px;width:300px;text-align:center;">
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

let typewriterTimeout = null; 

function typeWriterEffect(element, text, speed = 20) {
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
  const shareUrl = `${window.location.origin}${window.location.pathname}?u=${username}&post=${postId}`;

  navigator.clipboard.writeText(shareUrl).then(() => {
    alert(`📢 Tautan karya @${username} berhasil disalin! Siap dibagikan ke komunitas 🌱\n\nLink: ${shareUrl}`);
  }).catch((err) => {
    console.error("Gagal menyalin tautan:", err);
    alert(`Salin tautan ini secara manual:\n${shareUrl}`);
  });
}

setTimeout(async () => {
  const postIdParam = urlParams.get("post");
  if (postIdParam) {
    const targetCard = document.getElementById(`post-card-${postIdParam}`);
    if (targetCard) {
      if (typeof toggleKomentarBox === "function") {
        await toggleKomentarBox(postIdParam);
      }
      
      targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
      
      targetCard.style.transition = "all 0.5s ease";
      targetCard.style.boxShadow = "0 0 15px rgba(47, 111, 78, 0.35)";
      targetCard.style.borderColor = "#2f6f4e";
    }
  }
}, 500); 

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
  const teksBaru = prompt("Edit catatan karya Anda:", teksLama);
  if (teksBaru === null) return; 
  if (!teksBaru.trim()) return alert("Catatan tidak boleh kosong 🌱");

  const { error } = await supabaseClient
    .from("contributions")
    .update({ deskripsi_proses: teksBaru.trim() })
    .eq("id", postId);

  if (error) {
    alert("Gagal memperbarui postingan: " + error.message);
  } else {
    alert("Postingan berhasil diperbarui! 🌿");
    if (typeof loadUserPosts === "function") loadUserPosts(); 
  }
}

async function aksiKembalikanKeBeranda(postId) {
  const yakin = confirm("Tampilkan kembali postingan ini ke lini masa Beranda Umum? 🌍");
  if (!yakin) return;

  const { error } = await supabaseClient
    .from("contributions")
    .update({ is_private: false }) 
    .eq("id", postId);

  if (error) {
    alert("Gagal memproses: " + error.message);
  } else {
    alert("Postingan dipublikasikan kembali ke Beranda Umum! 🚀");
    if (typeof loadUserPosts === "function") loadUserPosts(); 
  }
}

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

// ==========================================
// 🔔 SISTEM NOTIFIKASI OTOMATIS (FRONTEND TOF)
// ==========================================

function inisialisasiKomponenNotif() {
  if (!currentWallet) return; 

  const wrapperLama = document.getElementById("tof-notif-wrapper");
  if (wrapperLama) wrapperLama.remove();

  const styleNotif = document.createElement("style");
  styleNotif.id = "tof-notif-style";
  styleNotif.innerHTML = `
    #tof-notif-wrapper {
      position: absolute !important;
      top: 15px !important;
      left: 60px !important;
      z-index: 999999999 !important;
      font-family: sans-serif !important;
      display: block !important;
      visibility: visible !important;
    }
    #box-notif-tof {
      display: none;
      position: absolute !important;
      top: 55px !important;
      width: 300px !important;
      max-height: 380px !important;
      background: white !important;
      border: 2px solid #2f6f4e !important;
      border-radius: 8px !important;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3) !important;
      overflow-y: auto !important;
    }
    @media (max-width: 768px) {
      #tof-notif-wrapper {
        position: absolute !important;
        top: 85px !important;    
        right: 60% !important;   
        transform: translateX(50%) !important; 
      }
      #box-notif-tof {
        right: auto !important;
        left: 50% !important;    
        transform: translateX(-50%) !important;
        width: 280px !important;
        max-height: 320px !important;
      }
    }
  `;
  
  const styleLama = document.getElementById("tof-notif-style");
  if (styleLama) styleLama.remove();
  document.head.appendChild(styleNotif);

  const notifWrapper = document.createElement("div");
  notifWrapper.id = "tof-notif-wrapper";

  notifWrapper.innerHTML = `
    <button id="btn-lonceng-tof" style="background: #2f6f4e; color: white; border: 2px solid white; width: 46px; height: 46px; border-radius: 50%; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.4); position: relative; display: flex; align-items: center; justify-content: center; font-size: 20px; outline: none; -webkit-tap-highlight-color: transparent;">
      🔔
      <span id="badge-notif-tof" style="display: none; position: absolute; top: -4px; right: -4px; background: #dc2626; color: white; font-size: 10px; font-weight: bold; padding: 2px 5px; border-radius: 10px; border: 1px solid white;">0</span>
    </button>

    <div id="box-notif-tof">
      <div style="padding: 10px; background: #f4fbf7; border-bottom: 1px solid #e2ece7; font-weight: bold; color: #2f6f4e; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size:12px;">Pemberitahuan Ladang</span>
        <button id="btn-tandai-baca" style="background:none; border:none; color:#6ea84f; font-size:11px; cursor:pointer; font-weight:600;">Tandai Dibaca</button>
      </div>
      <div id="list-notif-tof" style="font-size: 13px; background: white;">
        <div style="padding: 20px; text-align: center; color: #999;">Memuat pemberitahuan...</div>
      </div>
    </div>
  `;

  if (document.body.firstChild) {
    document.body.insertBefore(notifWrapper, document.body.firstChild);
  } else {
    document.body.appendChild(notifWrapper);
  }

  const btnLonceng = document.getElementById("btn-lonceng-tof");
  const boxNotif = document.getElementById("box-notif-tof");
  
  btnLonceng.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (boxNotif.style.display === "none" || boxNotif.style.display === "") {
      boxNotif.style.display = "block";
      loadNotifikasiUser(); 
    } else {
      boxNotif.style.display = "none";
    }
  });

  document.addEventListener("click", (e) => {
    if (!notifWrapper.contains(e.target)) {
      boxNotif.style.display = "none";
    }
  });

  document.getElementById("btn-tandai-baca").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    tandaiSemuaNotifDibaca();
  });
}

async function loadNotifikasiUser() {
  if (!currentWallet) return;

  try {
    const { data: notifs, error } = await supabaseClient
      .from("notifications")
      .select("*")
      .eq("user_id", currentWallet)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    const badge = document.getElementById("badge-notif-tof");
    const listContainer = document.getElementById("list-notif-tof");

    const jumlahBelumBaca = notifs ? notifs.filter(n => !n.is_read).length : 0;
    if (badge) {
      if (jumlahBelumBaca > 0) {
        badge.innerText = jumlahBelumBaca;
        badge.style.display = "block";
      } else {
        badge.style.display = "none";
      }
    }

    if (!notifs || notifs.length === 0) {
      if (listContainer) {
        listContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: #999;">Belum ada pemberitahuan baru.</div>`;
      }
      return;
    }

    const semuaSender = [...new Set(notifs.map(n => n.sender_id))];
    const { data: daftarProfil, error: errorProfil } = await supabaseClient
      .from("profiles")
      .select("id, username")
      .in("id", semuaSender);

    const petaProfil = {};
    if (!errorProfil && daftarProfil) {
      daftarProfil.forEach(p => {
        petaProfil[p.id] = p.username;
      });
    }

    const listHtml = notifs.map(n => {
      const namaPengirim = petaProfil[n.sender_id] || "Seseorang";
      let linkAksi = "";

      if (n.type === 'comment' || n.type === 'mention') {
          linkAksi = `window.location.href='?u=${profileUsername}&post=${n.related_id}'`;
      } else if (n.type === 'vote_needed') {
          linkAksi = `window.location.href='/html/dashboard.html'`;
      }

      const bgWarna = n.is_read ? "white" : "#f0fdf4";

      return `
        <div onclick="${linkAksi}" style="padding:12px; border-bottom:1px solid #eee; cursor:pointer; background: ${bgWarna}; transition: background 0.2s;" onmouseover="this.style.background='#f7faf8'" onmouseout="this.style.background='${bgWarna}'">
          <strong>@${namaPengirim}</strong> ${n.message}
          <span style="font-size: 10px; color: #999; display: block; margin-top: 4px;">
            ${new Date(n.created_at).toLocaleDateString('id-ID')}
          </span>
        </div>
      `;
    }).join("");
    
    if (listContainer) {
      listContainer.innerHTML = listHtml;
    }

  } catch (err) {
    console.log("Gagal memuat notifikasi:", err.message);
  }
}

async function tandaiSemuaNotifDibaca() {
  if (!currentWallet) return;
  try {
    await supabaseClient
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", currentWallet)
      .eq("is_read", false);

    loadNotifikasiUser();
  } catch (err) {
    console.log("Gagal menandai baca:", err.message);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    inisialisasiKomponenNotif();
    setTimeout(loadNotifikasiUser, 2000); 
  });
} else {
  inisialisasiKomponenNotif();
  setTimeout(loadNotifikasiUser, 2000);
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