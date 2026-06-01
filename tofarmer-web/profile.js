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
      // Jika benar-benar kosong total dari segala arah akses
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
  if (!box) return

  // Sinkronisasi hak akses
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

    // 3. Trigger AI
    const responseBox = document.getElementById("ai-response");
    responseBox.innerText = "Teman Kebun sedang melihat karya baru...";
    
    aiChatCounter = 0; 
    document.getElementById("ai-chat-area").style.display = "block";
    const sisa = document.getElementById("sisa-chat");
    if (sisa) sisa.innerText = 3;

    const komentarLucu = await panggilAiSaran("humor", { 
        teks: text, 
        trigger: "Baru saja menanam karya" 
    });
    
    responseBox.innerText = `🤖 Teman Kebun: ${komentarLucu}`;
}

async function panggilAiSaran(mode, payload) {
    try {
        const response = await fetch("https://tofarmer-api.tofarmer-api.workers.dev/ai-saran", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mode: mode, 
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
    if (aiChatCounter >= 3) return;

    const input = document.getElementById("ai-input");
    const responseBox = document.getElementById("ai-response");
    const text = input.value.trim();
    
    if (!text) return;

    const btn = document.querySelector('[onclick="kirimChatAI()"]');
    if (btn) btn.disabled = true;
    
    // Tampilkan status loading tanpa mengacaukan efek ketik
    responseBox.innerText = "Teman Kebun sedang merangkai kata...";
    
    try {
        const jawaban = await panggilAiSaran("humor", { teks: text, trigger: "Balas chat user" });
        
        aiChatCounter++;
        // Gunakan efek ketik untuk hasil respon
        typeWriterEffect(responseBox, `🤖 Teman Kebun: ${jawaban}`);
        
        input.value = "";
        
        // Update counter
        const sisa = document.getElementById("sisa-chat");
        if (sisa) sisa.innerText = 3 - aiChatCounter;

        if (aiChatCounter >= 3) {
            document.getElementById("ai-chat-area").innerHTML = "<em>Sudah 3 ronde! Saya balik nyangkul dulu ya...</em>";
        }
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

  // Ambil postingan sekaligus join data username dari tabel profiles agar pembacaan meta tag akurat
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

  // ===================== 🟢 KODE SINKRONISASI META TAG YANG SUDAH DIPERBAIKI =====================
  try {
    const postIdParam = urlParams.get("post");

    if (postIdParam) {
      const matchedPost = data.find(p => p.id === postIdParam || String(p.id) === String(postIdParam));
      
      if (matchedPost) {
        const petikTeks = matchedPost.deskripsi_proses ? matchedPost.deskripsi_proses.substring(0, 100) + "..." : "Intip progres kebun karya di ToFarmer.";
        const namaPetani = matchedPost.profiles?.username || "Petani";

        // Ubah Judul Tab & Meta Tag Secara Live di Halaman Profil
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
  // ==============================================================================================

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
      <div class="card" style="margin-bottom:14px;">

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
          <button class="share-btn" onclick="sharePost('${post.id}', '${currentUsername}', \`${safeText}\`)">
            📢 Bagikan Karya
          </button>
        </div>

        <input id="cmt-${post.id}" placeholder="Tulis komentar..." style="width:100%;padding:8px;border-radius:10px;border:1px solid #ddd;font-size:12px;box-sizing:border-box;" />

        <button class="btn-glow" onclick="sendComment('${post.id}')" style="margin-top:6px;padding:6px 10px;font-size:12px;width:auto;">Kirim</button>

        <div id="commentBox-${post.id}" style="margin-top:8px;font-size:12px;color:#444;"></div>

      </div>
    `
  }).join("")

  setTimeout(() => data.forEach(p => loadComments(p.id)), 0)
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

    // Muat ulang tampilan agar angka berubah di layar browser
    await loadUserPosts();

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