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
// --- TAMBAHKAN KODE INI SESUDAHNYA ---
// INISIALISASI KOMPONEN NOTIFIKASI & PESAN
setTimeout(() => {
  // Hanya jalankan jika profil yang dibuka adalah milik kita
  if (currentWallet && targetProfileId && currentWallet === targetProfileId) {
    inisialisasiKomponenNotif();
    inisialisasiKomponenPesan(); 
  }
}, 1000);
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
checkUnreadNotifications();
}

loadProfile()

// =====================
// PROFILE RENDER
// =====================

function renderProfileData(data) {
  document.getElementById("profile").innerHTML = `
    <div class="card" style="text-align:center;">
      <img
        src="${data.avatar_url || 'https://www.tofarmer.xyz/aset/favicon.png'}"
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
// =========================================================================
// 🌿 FUNGSI UTAMA: SEND PROFILE POST (INTEGRASI DATABASE, AI & LOADING)
// =========================================================================
async function sendProfilePost() {
  let imageUrl = null
  const input = document.getElementById("profilePostBox")
  const imageInput = document.getElementById("profileImage")
  
  // Ambil elemen tombol untuk dipasangi efek loading
  // Pastikan di HTML Anda tombol ini memiliki onclick="sendProfilePost()"
  // Kita cari berdasarkan teks tombol atau Anda bisa menambahkan id="btnTanamKarya" pada tag button HTML-nya
  const btnTanam = document.querySelector("button[onclick='sendProfilePost()']");
  
  if (!input) return

  const text = input.value.trim()
  if (!text) {
    alert("Deskripsi karya tidak boleh kosong, Kang! ☕");
    return;
  }

  // --- START LOADING EFFECT ---
  let teksTombolAsli = "🌱 TANAM KARYA";
  if (btnTanam) {
    teksTombolAsli = btnTanam.innerHTML;
    btnTanam.disabled = true; // Kunci tombol agar tidak bisa diklik dua kali
    btnTanam.style.opacity = "0.7";
    btnTanam.innerHTML = "⏳ Sedang Menanam Karya ke Ladang..."; 
  }

  try {
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
      // Update teks loading khusus jika sedang upload file gambar yang berat
      if (btnTanam) btnTanam.innerHTML = "📸 Sedang Mengompres & Mengunggah Gambar...";
      
      const fileName = `${currentWallet}-${Date.now()}-${file.name || "img"}`
      
      const { error: uploadError } = await supabaseClient.storage
        .from("post-images")
        .upload(fileName, file, { cacheControl: "3600", upsert: false })

      if (uploadError) throw uploadError;

      const { data } = supabaseClient.storage.from("post-images").getPublicUrl(fileName)
      if (!data?.publicUrl) {
        throw new Error("Gagal mengambil public URL gambar.");
      }
      imageUrl = data.publicUrl
    }

    if (btnTanam) btnTanam.innerHTML = "📝 Mencatat di Buku Ladang Supabase...";

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

    if (error) throw error;

    alert("Karya berhasil ditanam di ladang! 🌱🎨");

    // --- AMANKAN UPDATE XP ---
    try {
      const { data: dbProfile } = await supabaseClient
        .from("profiles")
        .select("xp")
        .eq("id", currentWallet)
        .single();

      const currentXp = dbProfile?.xp || 0;
      await supabaseClient
        .from("profiles")
        .update({ xp: currentXp + xpBonus })
        .eq("id", currentWallet);
    } catch (xpErr) {
      console.log("Gagal sinkronisasi bonus XP:", xpErr);
    }

    // --- KIRIM NOTIFIKASI MASSAL ---
    try {
      const { data: semuaUser } = await supabaseClient.from("profiles").select("id");
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
          await supabaseClient.from("notifications").insert(daftarNotif);
        }
      }
    } catch (errNotif) {
      console.log("Notifikasi massal dilewati:", errNotif.message);
    }

    // Bereskan form input
    input.value = ""
    if (imageInput) imageInput.value = ""

    await loadUserPosts(); 

    // --- ANTARMUKA INTERAKSI AI TEMAN KEBUN ---
    const responseBox = document.getElementById("ai-response");
    const aiChatArea = document.getElementById("ai-chat-area");
    
    if (responseBox && aiChatArea) {
      responseBox.innerText = "Teman Kebun sedang menganalisis karya barumu...";
      
      window.aiChatCounter = 0; 
      window.lastAiContext = text; 

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
        const konteksRAG = generateProfileContext(latestProfile, riwayatLama);

        const komentarLucu = await panggilAiSaran("Evaluasi", { 
            teks: text, 
            trigger: `User baru saja menanam karya baru: "${text}". Berikan evaluasi singkat, jujur, humoris, khas petani Indonesia. Hubungkan analisis/pujian/kritikmu dengan rekam jejak masa lalunya:\n${konteksRAG}` 
        });
        
        if (typeof typeWriterEffect === "function") {
          typeWriterEffect(responseBox, `🤖 Teman Kebun: ${komentarLucu}`);
        } else {
          responseBox.innerText = `🤖 Teman Kebun: ${komentarLucu}`;
        }

        setTimeout(() => {
          aiChatArea.style.display = "block";
          const sisa = document.getElementById("sisa-chat");
          if (sisa) sisa.innerText = 3;
        }, 2000);
      }
    }

  } catch (globalError) {
    console.error("Proses menanam gagal:", globalError);
    alert("Gagal menanam karya: " + globalError.message);
  } finally {
    // --- STOP LOADING EFFECT (KEMBALIKAN TOMBOL KE SEMULA) ---
    if (btnTanam) {
      btnTanam.disabled = false;
      btnTanam.style.opacity = "1";
      btnTanam.innerHTML = teksTombolAsli;
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
    box.innerHTML = "<p style='font-size:11px; color:#999; font-style:italic;'>Belum ada komentar</p>";
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
    const avatar = c.profiles?.avatar_url || "https://www.tofarmer.xyz/images/logo-tofarmer.png";

    const time = new Date(c.created_at).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });

    // Perubahan ada di bagian onclick di bawah ini, Kang!
    return `
      <div style="display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid #eee;">
        <img 
          src="${avatar}" 
          onclick="window.location.href='?u=${user}'"
          style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; flex-shrink: 0; cursor: pointer;" 
        />
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
            <div 
              onclick="window.location.href='?u=${user}'"
              style="font-weight: 700; font-size: 13px; color: #2f6f4e; cursor: pointer;"
              onmouseover="this.style.textDecoration='underline'"
              onmouseout="this.style.textDecoration='none'"
            >
              @${user}
            </div>
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
if (currentWallet !== targetProfileId) return;

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

// =========================================================================
// 🔔 FUNGSI: MEMUAT NOTIFIKASI USER & FIX BUG LINK ALTERNATIF
// =========================================================================
// =========================================================================
// 🔔 FUNGSI: MEMUAT NOTIFIKASI USER EKOSISTEM SEMESTA TOF (7 TABEL GABUNGAN)
// =========================================================================
async function loadNotifikasiUser() {
  if (!currentWallet) return;

  try {
    // -----------------------------------------------------------------
    // 1. PANGGIL TABEL UTAMA (NOTIFICATIONS) - FORMAT ASLI AKANG
    // -----------------------------------------------------------------
    const { data: notifications, error } = await supabaseClient
      .from("notifications")
      .select("*")
      .eq("user_id", currentWallet)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    const listContainer =
      document.getElementById("list-notif-tof") ||
      document.getElementById("notification-list");

    // -----------------------------------------------------------------
    // 2. AMBIL DATA DARI TABEL-TABEL INTERAKSI & KONTEN LAINNYA
    // -----------------------------------------------------------------
    
    // A. Ambil data dari tabel COMMENTS
    const { data: rawComments, error: errorComments } = await supabaseClient
      .from("comments")
      .select("id, post_id, user_id, comment, created_at")
      .neq("user_id", currentWallet) // Abaikan komentar kita sendiri
      .order("created_at", { ascending: false })
      .limit(15);

    if (errorComments) console.log("Gagal memuat data tabel comments:", errorComments.message);

    // B. Ambil data dari tabel CONTRIBUTIONS (Karya/Catatan Baru)
    const { data: rawContributions, error: errorContributions } = await supabaseClient
      .from("contributions")
      .select("id, user_id, judul_aksi, created_at")
      .neq("user_id", currentWallet) // Abaikan karya sendiri
      .order("created_at", { ascending: false })
      .limit(15);

    if (errorContributions) console.log("Gagal memuat data tabel contributions:", errorContributions.message);

    // C. Ambil data dari tabel ILMU_BAKU (Ilmu Terverifikasi)
    const { data: rawIlmuBaku, error: errorIlmuBaku } = await supabaseClient
      .from("ilmu_baku")
      .select("id, user_id, judul_aksi, approved_at")
      .neq("user_id", currentWallet)
      .order("approved_at", { ascending: false })
      .limit(15);

    if (errorIlmuBaku) console.log("Gagal memuat data tabel ilmu_baku:", errorIlmuBaku.message);

    // D. Ambil data dari tabel ILMU_PENDING (Usulan Ilmu Baru)
    const { data: rawIlmuPending, error: errorIlmuPending } = await supabaseClient
      .from("ilmu_pending")
      .select("id, user_id, judul_aksi, created_at")
      .neq("user_id", currentWallet)
      .order("created_at", { ascending: false })
      .limit(15);

    if (errorIlmuPending) console.log("Gagal memuat data tabel ilmu_pending:", errorIlmuPending.message);

    // E. Ambil data dari tabel REACTIONS (Sruput & Cangkul)
    const { data: rawReactions, error: errorReactions } = await supabaseClient
      .from("reactions")
      .select("id, post_id, user_id, type, created_at")
      .neq("user_id", currentWallet) // Abaikan reaksi dari diri kita sendiri
      .order("created_at", { ascending: false })
      .limit(20);

    if (errorReactions) console.log("Gagal memuat data tabel reactions:", errorReactions.message);

    // -----------------------------------------------------------------
    // 3. PROSES PENGGABUNGAN MANUAL DAN STANDARDISASI FORMAT DATA
    // -----------------------------------------------------------------
    let semuaNotifGabungan = [];

    // [Tabel 1] Masukkan data dari tabel notifications (Format Asli)
    if (notifications && notifications.length > 0) {
      notifications.forEach(n => {
        semuaNotifGabungan.push({
          id: `notif-${n.id}`,
          sender_id: n.sender_id,
          type: n.type,
          message: n.message,
          related_id: n.related_id,
          is_read: n.is_read || false,
          created_at: n.created_at
        });
      });
    }

    // [Tabel 2] Masukkan data dari tabel comments
    if (rawComments && rawComments.length > 0) {
      rawComments.forEach(c => {
        semuaNotifGabungan.push({
          id: `comment-${c.id}`,
          sender_id: c.user_id,
          type: "comment", // Memicu pengkondisian link komentar di bawah
          message: `mengomentari catatan karya anda: "${c.comment ? c.comment.substring(0, 30) : ''}..."`,
          related_id: c.post_id,
          is_read: false,
          created_at: c.created_at
        });
      });
    }

    // [Tabel 3] Masukkan data dari tabel contributions (Karya Baru)
    if (rawContributions && rawContributions.length > 0) {
      rawContributions.forEach(post => {
        semuaNotifGabungan.push({
          id: `post-${post.id}`,
          sender_id: post.user_id,
          type: "karya_baru", 
          message: `baru saja membagikan karya baru: "${post.judul_aksi}"`,
          related_id: post.id,
          is_read: false,
          created_at: post.created_at
        });
      });
    }

    // [Tabel 4] Masukkan data dari tabel ilmu_baku (Ilmu Sah)
    if (rawIlmuBaku && rawIlmuBaku.length > 0) {
      rawIlmuBaku.forEach(ib => {
        semuaNotifGabungan.push({
          id: `ilmubaku-${ib.id}`,
          sender_id: ib.user_id,
          type: "ilmu_baru",
          message: `menambahkan ilmu baku baru ke lumbung: "${ib.judul_aksi}"`,
          related_id: ib.id,
          is_read: false,
          created_at: ib.approved_at
        });
      });
    }

    // [Tabel 5] Masukkan data dari tabel ilmu_pending (Usulan Ilmu Masuk Sistem Moderasi)
    if (rawIlmuPending && rawIlmuPending.length > 0) {
      rawIlmuPending.forEach(ip => {
        semuaNotifGabungan.push({
          id: `ilmupending-${ip.id}`,
          sender_id: ip.user_id,
          type: "vote_needed", // Lari ke dashboard untuk rembugan warga
          message: `mengajukan usulan ilmu baru untuk di-vote bersama: "${ip.judul_aksi}"`,
          related_id: ip.id,
          is_read: false,
          created_at: ip.created_at
        });
      });
    }

    // [Tabel 6] Masukkan data dari tabel reactions (Sruput & Cangkul)
    if (rawReactions && rawReactions.length > 0) {
      rawReactions.forEach(r => {
        let jenisReaksiMessage = "";
        
        if (r.type === "sruput") {
          jenisReaksiMessage = "baru saja menyeruput kopi hangat di catatan karya anda ☕";
        } else if (r.type === "cangkul") {
          jenisReaksiMessage = "datang memberikan bantuan cangkul (sangat menyukai) di ladang karya anda 🌾";
        } else {
          jenisReaksiMessage = "memberikan apresiasi pada karya anda";
        }

        semuaNotifGabungan.push({
          id: `reaction-${r.id}`,
          sender_id: r.user_id,   // Alamat wallet warga yang ngasih reaksi
          type: r.type,           // Nilai asli: "sruput" atau "cangkul"
          message: jenisReaksiMessage,
          related_id: r.post_id,  // ID karya target
          is_read: false,
          created_at: r.created_at
        });
      });
    }

    // Jika seluruh semesta tabel kosong, cetak info kosong
    if (semuaNotifGabungan.length === 0) {
      if (listContainer) {
        listContainer.innerHTML =
          "<p style='padding:15px; color:#999; font-style:italic; font-size:13px; text-align:center;'>Belum ada pemberitahuan baru.</p>";
      }
      return;
    }

    // Urutkan segalanya secara kronologis murni (Terbaru berada di paling atas)
    semuaNotifGabungan.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Batasi total tayangan maksimal 20 baris teratas saja
    const finalNotifications = semuaNotifGabungan.slice(0, 20);

    // -----------------------------------------------------------------
    // 4. AMBIL DATA USERNAME (TABEL PROFILES) - FORMAT ASLI AKANG
    // -----------------------------------------------------------------
    const senderIds = [...new Set(finalNotifications.map(n => n.sender_id))];

    const { data: senderProfiles } = await supabaseClient
      .from("profiles")
      .select("id, username")
      .in("id", senderIds);

    const profileMap = Object.fromEntries(
      (senderProfiles || []).map(p => [p.id, p])
    );

    const urlParams = new URLSearchParams(window.location.search);
    const currentProfileUser = urlParams.get("u") || profileUsername;

    // -----------------------------------------------------------------
    // 5. RENDER HTML DAN KONFIGURASI LINK AKSI - FORMAT ASLI AKANG
    // -----------------------------------------------------------------
    const listHtml = finalNotifications.map(n => {
      const usernameAsliPengirim =
        profileMap[n.sender_id]?.username || "petani";

      let namaDisplay = `@${usernameAsliPengirim}`;
      if (n.sender_id === currentWallet) {
        namaDisplay = "Anda";
      }

      // ===============================
      // DEFAULT: ke profile user
      // ===============================
      let linkAksi =
        `window.location.assign('profile.html?u=${usernameAsliPengirim}');`;

      // =========================================================================
      // FIX: Arahkan ke post target (Mendukung pancingan interaksi sosial warga)
      // =========================================================================
      if (
        (n.type === "mention" ||
          n.type === "comment" ||
          n.type === "sruput" ||   
          n.type === "cangkul") && 
        n.related_id
      ) {
        // Jika interaksinya berupa komentar, kunci tetap di halaman profil pemilik karya saat ini
        const targetUser = (n.type === "comment") ? (currentProfileUser || usernameAsliPengirim) : usernameAsliPengirim;

        linkAksi =
          `window.location.assign('profile.html?u=${targetUser}&targetPost=${n.related_id}');`;
      } else if (n.type === "vote_needed") {
        // Otomatis lari ke halaman dashboard kelurahan untuk proses rembug/voting
        linkAksi =
          `window.location.assign('/html/dashboard.html');`;
      }
      // ==========================================
      // LINK AKSI UNTUK KARYA/ILMU BARU GLOBAL
      // ==========================================
      else if (
        (n.type === "new_post" || 
         n.type === "share" || 
         n.type === "karya_baru" || 
         n.type === "ilmu_baru") && 
        n.related_id
      ) {
        linkAksi = `window.location.assign('profile.html?u=${usernameAsliPengirim}&targetPost=${n.related_id}');`;
      }

      const bgWarna = n.is_read ? "white" : "#f0fdf4";

      return `
        <div 
          onclick="${linkAksi}" 
          style="padding:12px; border-bottom:1px solid #eee; cursor:pointer; background:${bgWarna}; transition: background 0.2s;" 
          onmouseover="this.style.background='#f7faf8'" 
          onmouseout="this.style.background='${bgWarna}'"
        >
          <strong>${namaDisplay}</strong> ${n.message}
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
    console.log("Gagal memuat sistem notifikasi hybrid:", err.message);
  }
}

 // Cukup satu event listener ini saja untuk menghandle semuanya
document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Inisialisasi Notifikasi
    inisialisasiKomponenNotif();
    setTimeout(loadNotifikasiUser, 2000); 

    // 2. Inisialisasi Sistem Pesan
    cekPesanMasuk();
    setInterval(cekPesanMasuk, 30000); 

    // 3. Inisialisasi Tombol Kirim Pesan
    const tombolKirim = document.getElementById("tombol-kirim-di-profil");
    if (tombolKirim) {
        tombolKirim.onclick = () => {
            const isi = prompt("Tulis pesan Anda untuk warga ini:");
            if(isi) kirimPesanPribadi(window.currentProfileWallet, isi);
        };
    }
});

// Fungsi-fungsi tetap ditaruh di bawahnya (di luar event listener)
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

// ==========================================
// 🤖 INTERAKSI LANJUTAN: BALAS CHAT TEMAN KEBUN
// ==========================================
async function kirimChatAI() {
  const chatInput = document.getElementById("ai-input");
  const responseBox = document.getElementById("ai-response");
  const sisaLabel = document.getElementById("sisa-chat");
  const aiChatArea = document.getElementById("ai-chat-area");

  if (!chatInput || !responseBox) return;

  const userReply = chatInput.value.trim();
  if (!userReply) return;

  // Cek inisialisasi counter jatah chat (Maksimal 3 kali)
  if (typeof window.aiChatCounter === "undefined") {
    window.aiChatCounter = 0;
  }

  if (window.aiChatCounter >= 3) {
    alert("Jatah diskusi ronde ini sudah habis, Kang! Teman Kebun mau lanjut nyangkul di ladang dulu. 🚜");
    if (aiChatArea) aiChatArea.style.display = "none";
    return;
  }

  // Naikkan counter & update UI sisa chat
  window.aiChatCounter++;
  const sisaKuota = 3 - window.aiChatCounter;
  if (sisaLabel) sisaLabel.innerText = sisaKuota;

  // Kosongkan kolom ketik balasan langsung
  chatInput.value = "";
  responseBox.innerText = "Teman Kebun sedang mendengarkan curhatanmu...";

  try {
    // Panggil Cloudflare Workers untuk membalas chat secara kontekstual
    const balasanAi = await panggilAiSaran("Diskusi", {
      teks: userReply,
      trigger: `User membalas obrolanmu tentang karyanya. Karyanya tadi: "${window.lastAiContext || 'Baru menanam'}". User berkata: "${userReply}". Jawab dia dengan gaya asisten petani lokal yang akrab, singkat, solutif, serta beri sentuhan humor!`
    });

    if (typeof typeWriterEffect === "function") {
      typeWriterEffect(responseBox, `🤖 Teman Kebun: ${balasanAi}`);
    } else {
      responseBox.innerText = `🤖 Teman Kebun: ${balasanAi}`;
    }

    // Jika jatah sudah habis setelah chat ini, tutup form inputnya otomatis
    if (sisaKuota <= 0) {
      setTimeout(() => {
        if (aiChatArea) aiChatArea.style.display = "none";
        responseBox.innerHTML += "<br><br><em>🤖 Teman Kebun: Sudah 3 ronde obrolan nih Kang, saya balik nyangkul dulu ya! Sampai jumpa di karya berikutnya!</em>";
      }, 5000);
    }

  } catch (err) {
    console.error("Gagal melanjutkan diskusi AI:", err);
    responseBox.innerText = "🤖 Teman Kebun: Cangkul saya agak patah barusan, coba ketik lagi Kang!";
  }
}
/// =====================================================
// 🎯 AUTO FOCUS TARGET POST DARI NOTIFIKASI
// =====================================================
function handleTargetPostFromNotification() {
  const urlParams = new URLSearchParams(window.location.search);
  const targetPost = urlParams.get("targetPost");

  if (!targetPost) return;

  setTimeout(() => {
    const el = document.getElementById(`post-card-${targetPost}`);

    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      // highlight biar keliatan targetnya
      el.style.border = "2px solid #22c55e";
      el.style.background = "#f0fdf4";
      el.style.transition = "0.3s ease";
    }
  }, 800);
}

// Fungsi untuk mengecek jumlah notifikasi belum dibaca ke Supabase
async function checkUnreadNotifications() {
  if (!currentWallet) return;

  const { count, error } = await supabaseClient
    .from("notifications")
    .select("id", { count: 'exact', head: true })
    .eq("user_id", currentWallet)
    .eq("is_read", false);

  if (!error) {
    updateNotificationUI(count);
  }
}

async function updateNotificationUI(count) {
  const badge = document.getElementById("badge-notif-tof");
  if (!badge) return;

  if (count > 0) {
    badge.style.display = "flex"; 
    badge.innerText = count > 9 ? "9+" : count; 
  } else {
    badge.style.display = "none"; 
  }
}

// =====================================================
// JALANKAN SATU KALI SAJA DI SINI:
// =====================================================
setTimeout(() => {
  handleTargetPostFromNotification();
  checkUnreadNotifications();
}, 1000);

// ========================================================
// INISIALISASI TOMBOL PESAN (Mailbox)
// ========================================================
function inisialisasiKomponenPesan() {
    if (!currentWallet) return;
    if (currentWallet !== targetProfileId) return;

    const notifWrapper = document.getElementById("tof-notif-wrapper");
    if (!notifWrapper) return; 

    if (document.getElementById("btn-pesan-tof")) return;

    const btnPesan = document.createElement("button");
    btnPesan.id = "btn-pesan-tof";
    btnPesan.innerHTML = "✉️";
    btnPesan.style.cssText = `
        background: #3b82f6; 
        border-radius: 50%; 
        width: 40px; 
        height: 40px; 
        border: 2px solid white; 
        cursor: pointer; 
        color: white; 
        margin-top: 10px; 
        display: flex; 
        align-items: center; 
        justify-content: center;
        font-size: 18px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        z-index: 9999;
    `;
    
    btnPesan.onclick = bukaInbox;

    // Pastikan wrapper notifikasi fleksibel untuk menampung tombol di bawah lonceng
    notifWrapper.style.display = "flex";
    notifWrapper.style.flexDirection = "column";
    notifWrapper.style.alignItems = "center"; 

    notifWrapper.appendChild(btnPesan);
    updateBadgePesan();
}
// --- TARUH updateBadgePesan DI SINI ---
async function updateBadgePesan() {
    if (!currentWallet) return;

    const { count, error } = await supabaseClient
        .from("pesan_warga")
        .select("id", { count: 'exact', head: true })
        .eq("penerima_id", currentWallet)
        .eq("is_read", false);

    const badge = document.getElementById("badge-pesan-tof");
    if (badge) {
        if (!error && count > 0) {
            badge.style.display = "flex"; 
            badge.innerText = count > 9 ? "9+" : count;
        } else {
            badge.style.display = "none";
        }
    }
}
// ========================================================
// LOGIKA KIRIM PESAN BY USERNAME
// ========================================================
async function cariDanKirim() {
    const inputUsername = document.getElementById("targetUsernameInput").value.trim();
    const isiPesan = document.getElementById("pesanBaruText").value.trim();
    
    if (!inputUsername || !isiPesan) {
        alert("Username dan pesan jangan dikosongkan ya!");
        return;
    }

    // 1. Cari User di tabel 'profiles' berdasarkan 'username'
    // Kita ambil 'id' karena itu adalah alamat wallet (sesuai tabel Anda)
    const { data: user, error } = await supabaseClient
        .from('profiles') 
        .select('id, username')
        .ilike('username', inputUsername) // ilike supaya tidak sensitif huruf besar/kecil
        .single();

    if (error || !user) {
        alert("Wah, username '" + inputUsername + "' tidak ditemukan di ladang!");
        return;
    }

    // 2. Kirim Pesan ke wallet tujuan (user.id adalah walletnya)
    const { error: kirimError } = await supabaseClient
        .from("pesan_warga")
        .insert([{
            pengirim_id: localStorage.getItem("tof_wallet"),
            penerima_id: user.id, // Pakai user.id dari tabel profiles
            isi_pesan: isiPesan,
            is_read: false
        }]);

    if (kirimError) {
        console.error(kirimError);
        alert("Gagal mengirim pesan.");
    } else {
        alert("Pesan berhasil dikirim ke @" + user.username);
        document.getElementById("pesanBaruText").value = ""; 
        document.getElementById("targetUsernameInput").value = "";
        
        if (typeof loadDaftarPesan === 'function') loadDaftarPesan();
    }
}

async function loadDaftarPesan() {
    const daftarPesan = document.getElementById("daftarPesan");
    
    // Ambil pesan dan "gabungkan" (join) dengan username pengirim
    const { data, error } = await supabaseClient
        .from("pesan_warga")
        .select(`
            isi_pesan, 
            users:pengirim_id (username) 
        `)
        .eq("penerima_id", currentWallet)
        .order("created_at", { ascending: false });

    if (error) return;

    daftarPesan.innerHTML = ""; // Bersihkan list lama

    data.forEach(msg => {
        const username = msg.users ? msg.users.username : "Warga";
        
       // ... di dalam data.forEach(msg => { ...
daftarPesan.innerHTML += `
    <div class="pesan-card" style="margin-bottom:12px; padding:12px; border-radius:15px; background:#f9f9f9; border-left: 4px solid #2f6f4e;">
        <div style="font-size:11px; color:#2f6f4e; font-weight:bold; margin-bottom:4px;">@${username}</div>
        <div style="font-size:14px; color:#333;">${msg.isi_pesan}</div>
    </div>
`;

    });
}
// ========================================================
// INISIALISASI OTOMATIS SAAT HALAMAN DIMUAT
// ========================================================
setTimeout(() => {
  if (currentWallet && targetProfileId && currentWallet === targetProfileId) {
    inisialisasiKomponenNotif();
    inisialisasiKomponenPesan();
  }
}, 1000);