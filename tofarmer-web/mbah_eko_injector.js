// =========================================================================
// MBAH EKO v3 — Bot Komentar Komunitas ToFarmer
// =========================================================================
// CARA KERJA:
//   1. Scan semua postingan di halaman
//   2. Kalau postingan belum pernah dikomentari Mbah Eko → komentar 1x
//   3. Kalau ada yang mention @mbah_eko di komentar → balas (meski sudah komentar)
//   4. Anti-spam: tidak akan komentar 2x untuk trigger yang sama
//   5. Tidak pernah mention diri sendiri
// =========================================================================
// ATURAN: File ini BERDIRI SENDIRI. Tidak menyentuh app.js / profile.js.
// =========================================================================

console.log("👴 [Mbah Eko v3] Bangun dari tidur siang...");

// ─────────────────────────────────────────────────────────────────────────
// KONFIGURASI — sesuaikan URL Worker kamu di sini
// ─────────────────────────────────────────────────────────────────────────
const MBAH_CFG = {
  // URL Cloudflare Worker kamu (ganti sesuai hasil deploy)
  WORKER_URL: "https://tofarmer-api.tofarmer-api.workers.dev/ai-saran",

  // ID akun Mbah Eko di Supabase (jangan diubah)
  ID_MBAH: "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY",

  // Username bot (dipakai untuk deteksi mention)
  BOT_USERNAME: "mbah_eko",

  // Jeda antar scan (ms) — jangan terlalu cepat
  DEBOUNCE_MS: 1000,

  // Berapa milidetik tunggu sebelum posting komentar (agar tidak terasa robot)
  JEDA_POSTING_MS: 1500,
};

// ─────────────────────────────────────────────────────────────────────────
// KNOWLEDGE BASE TOFARMER (ringkas untuk konteks AI)
// ─────────────────────────────────────────────────────────────────────────
const TOF_KONTEKS = `
ToFarmer adalah komunitas pertanian berbasis teknologi dengan 5 Pilar:
1. Komunitas & Narasi - gotong royong, dokumentasi, konten
2. Inovasi & Teknologi - AI, robotika, software pertanian
3. Ladang (Proof of Work) - eksperimen nyata di tanah, validasi ilmu
4. Finansial - token TOF, compounding, kemandirian ekonomi
5. Refleksi - filosofi, etika, menjaga nilai gerakan

Sistem XP: aktif posting/komentar/eksperimen = dapat XP → naik level (Grower→Pro→Specialist→Elite).
Token TOF: 1 TOF = Rp1.000. Tujuan: gaji otomatis dari hasil komunitas.
Ilmu Baku: pengetahuan yang sudah diuji berulang di lapangan, bukan sekadar teori.
`.trim();

// ─────────────────────────────────────────────────────────────────────────
// MODUL MEMORI
// ─────────────────────────────────────────────────────────────────────────
const MEMORI = {
  // Simpan pesan ke tabel ai_chat_history
  async simpan(userId, role, message) {
    if (!userId || !message || !window.supabaseClient) return;
    try {
      await window.supabaseClient.from("ai_chat_history").insert([{
        user_id: userId,
        role,
        message,
        agent: "mbah_eko",
      }]);
    } catch (e) {
      console.warn("Mbah Eko: gagal simpan memori →", e.message);
    }
  },

  // Ambil riwayat percakapan (semua agent) milik user
  async ambilRiwayat(userId, limit = 10) {
    if (!userId || !window.supabaseClient) return [];
    try {
      const { data, error } = await window.supabaseClient
        .from("ai_chat_history")
        .select("role, message, agent, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error || !data) return [];
      return data.reverse();
    } catch (e) {
      return [];
    }
  },

  // Format riwayat jadi teks untuk konteks AI
  formatRiwayat(riwayat) {
    if (!riwayat || riwayat.length === 0) return "(belum ada riwayat)";
    return riwayat.map(item => {
      const siapa = item.role === "user"
        ? "Petani"
        : (item.agent === "mbah_eko" ? "Mbah Eko" : "Teman Kebun");
      return `${siapa}: "${item.message}"`;
    }).join("\n");
  },

  // Ambil profil user
  async ambilProfil(userId) {
    if (!userId || !window.supabaseClient) return null;
    try {
      const { data } = await window.supabaseClient
        .from("profiles")
        .select("username, xp, saldo_tof")
        .eq("id", userId)
        .single();
      return data || null;
    } catch (e) {
      return null;
    }
  },

  // Cache respons terakhir per post untuk cegah duplikasi
  _cache: {},
  simpanCache(postId, teks) { this._cache[postId] = teks; },
  getCache(postId) { return this._cache[postId] || ""; },
};

// ─────────────────────────────────────────────────────────────────────────
// PEMBUAT PROMPT
// ─────────────────────────────────────────────────────────────────────────
function buatPrompt({ profil, riwayat, kontenPost, komentarBaru, cacheSebelumnya }) {
  const infoUser = profil
    ? `Kamu sedang merespons postingan/komentar dari @${profil.username} (Level XP: ${profil.xp || 0}).`
    : "";

  const antiUlang = cacheSebelumnya
    ? `\nJangan ulangi atau parafrase ini yang sudah kamu katakan sebelumnya: "${cacheSebelumnya}"\n`
    : "";

  const systemPrompt = `Kamu adalah Mbah Eko, petani senior komunitas ToFarmer.

KARAKTER MBAH EKO:
- Gaya bicara: santai khas orang tua yang bijak, sesekali pakai kata "lha", "nah", "to", "ya" — tapi jangan lebay.
- Jawab seperti ngobrol langsung, bukan ceramah panjang.
- Kalau tidak tahu, jujur: "Mbah belum pernah coba ini, tapi..." — jangan mengada-ada.
- Sesekali tanya balik 1 pertanyaan singkat yang relevan untuk menggali lebih dalam.
- JANGAN mulai jawaban dengan memanggil nama user, "Tentu!", "Baik!", "Benar sekali!", atau "Hai!".
- JANGAN sebut nama atau username kamu sendiri (mbah_eko) dalam jawaban.
- JANGAN tulis mention seperti @mbah_eko dalam jawaban.

BATAS JAWABAN:
- Maksimal 2-3 kalimat pendek. Kalau ada 2 poin, pisah jadi 2 baris.
- Kalau pertanyaan di luar pertanian/ToFarmer, arahkan balik ke konteks bertani atau komunitas.
- DILARANG memberi instruksi berbahaya (bahan kimia, dosis berlebihan, dsb).

KONTEKS KOMUNITAS TOFARMER:
${TOF_KONTEKS}

${infoUser}
${antiUlang}`;

  const userPrompt = `RIWAYAT DISKUSI SEBELUMNYA:
${riwayat}

ISI POSTINGAN:
"${kontenPost}"

KOMENTAR/PERTANYAAN YANG PERLU DIBALAS:
"${komentarBaru}"

Tulis balasan Mbah Eko (2-3 kalimat, santai, langsung ke inti):`;

  return { systemPrompt, userPrompt };
}

// ─────────────────────────────────────────────────────────────────────────
// PANGGIL AI (Cloudflare Worker)
// ─────────────────────────────────────────────────────────────────────────
async function panggilAI(systemPrompt, userPrompt) {
  const res = await fetch(MBAH_CFG.WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt, userPrompt }),
  });
  if (!res.ok) throw new Error(`Worker error: ${res.status}`);
  const json = await res.json();
  return (json.reply || "").trim();
}

// ─────────────────────────────────────────────────────────────────────────
// VALIDASI KUALITAS RESPONS
// ─────────────────────────────────────────────────────────────────────────
function responValid(teks, cacheSebelumnya) {
  if (!teks || teks.length < 8) return false;

  // Tolak frase robotik di awal
  const awalan = teks.toLowerCase().slice(0, 30);
  const fraserRobotik = ["tentu saja", "tentu!", "baik!", "benar sekali", "dengan senang hati", "halo", "hai "];
  if (fraserRobotik.some(f => awalan.startsWith(f))) return false;

  // Tolak kalau mention diri sendiri
  if (teks.toLowerCase().includes("@mbah_eko")) return false;

  // Tolak kalau > 80% kata sama dengan cache sebelumnya
  if (cacheSebelumnya && cacheSebelumnya.length > 10) {
    const setA = new Set(teks.toLowerCase().split(/\s+/));
    const setB = new Set(cacheSebelumnya.toLowerCase().split(/\s+/));
    const irisan = [...setA].filter(w => setB.has(w)).length;
    const similarity = irisan / Math.max(setA.size, setB.size);
    if (similarity > 0.78) return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// CEK DATABASE SUPABASE
// ─────────────────────────────────────────────────────────────────────────

// Apakah Mbah Eko sudah pernah komentar di post ini?
async function sudahKomentar(postId) {
  if (!window.supabaseClient) return false;
  const { data, error } = await window.supabaseClient
    .from("comments")
    .select("id")
    .eq("post_id", parseInt(postId))
    .eq("user_id", MBAH_CFG.ID_MBAH)
    .limit(1);
  return !error && data && data.length > 0;
}

// Apakah komentar terakhir di post ini adalah mention ke Mbah Eko
// (dan belum dibalas Mbah Eko)?
async function adaMentionBelumDibalas(postId) {
  if (!window.supabaseClient) return false;
  const { data, error } = await window.supabaseClient
    .from("comments")
    .select("user_id, comment")
    .eq("post_id", parseInt(postId))
    .order("created_at", { ascending: true });

  if (error || !data || data.length === 0) return false;

  const komentarTerakhir = data[data.length - 1];

  // Syarat: komentar terakhir bukan dari Mbah Eko, DAN menyebut @mbah_eko
  const bukanMbah = komentarTerakhir.user_id !== MBAH_CFG.ID_MBAH;
  const adaMention = komentarTerakhir.comment
    ?.toLowerCase()
    .includes(`@${MBAH_CFG.BOT_USERNAME}`);

  return bukanMbah && adaMention;
}

// Posting komentar ke Supabase
async function postingKomentar(postId, teks) {
  if (!window.supabaseClient) return false;
  const { error } = await window.supabaseClient.from("comments").insert([{
    post_id: parseInt(postId),
    user_id: MBAH_CFG.ID_MBAH,
    comment: teks,
  }]);
  return !error;
}

// ─────────────────────────────────────────────────────────────────────────
// FUNGSI GENERATE + POSTING KOMENTAR
// ─────────────────────────────────────────────────────────────────────────
async function prosesPost(post, jenis) {
  const postId = post.getAttribute("data-id")
    || post.id?.replace("post-card-", "")
    || post.id;
  if (!postId) return;

  // Ambil isi postingan
  const kontenPost = post.querySelector(".text, .deskripsi-proses")?.innerText?.trim() || "";

  // Ambil semua komentar yang terlihat di DOM
  const elemenKomen = post.querySelectorAll(
    ".comment-text, .comment-item, [data-comment-author], .list-komentar p"
  );
  let daftarKomen = [];
  elemenKomen.forEach(el => {
    if (el.closest("#advice-container") || el.id === "advice-box") return;
    const teks = el.innerText?.trim();
    const penulis = (
      el.getAttribute("data-comment-author") ||
      el.querySelector(".comment-author")?.innerText || ""
    ).toLowerCase().replace("@", "");
    if (!teks || teks.startsWith("Kirim") || teks.startsWith("Sruput")) return;
    // Jangan masukkan komentar milik Mbah Eko sendiri sebagai konteks "pertanyaan"
    if (!penulis.includes(MBAH_CFG.BOT_USERNAME)) {
      daftarKomen.push({ penulis, teks });
    }
  });

  // Yang akan dibalas: komentar terakhir (jika ada) atau konten postingan
  const komentarTarget = daftarKomen.length > 0
    ? daftarKomen[daftarKomen.length - 1].teks
    : kontenPost;

  if (!komentarTarget) return;

  // Ambil userId pemilik postingan
  const userId = post.getAttribute("data-user-id")
    || localStorage.getItem("tof_user_id")
    || localStorage.getItem("tof_wallet");

  // Simpan trigger ke memori
  if (userId) {
    const labelTrigger = jenis === "POSTINGAN_BARU"
      ? `[POSTINGAN]: ${kontenPost}`
      : komentarTarget;
    await MEMORI.simpan(userId, "user", labelTrigger);
  }

  // Ambil konteks
  const riwayatArr = await MEMORI.ambilRiwayat(userId, 10);
  const riwayatTeks = MEMORI.formatRiwayat(riwayatArr);
  const profil = userId ? await MEMORI.ambilProfil(userId) : null;
  const cacheSebelumnya = MEMORI.getCache(postId);

  // Buat prompt
  const { systemPrompt, userPrompt } = buatPrompt({
    profil,
    riwayat: riwayatTeks,
    kontenPost,
    komentarBaru: komentarTarget,
    cacheSebelumnya,
  });

  // Panggil AI (retry 1x jika respons tidak valid)
  let hasilAI = "";
  for (let percobaan = 0; percobaan < 2; percobaan++) {
    try {
      const sp = percobaan === 0
        ? systemPrompt
        : systemPrompt + "\n\nPENTING: Gunakan sudut pandang dan kalimat yang BERBEDA TOTAL dari percobaan sebelumnya.";
      hasilAI = await panggilAI(sp, userPrompt);
      if (responValid(hasilAI, cacheSebelumnya)) break;
      hasilAI = "";
    } catch (e) {
      console.warn(`Mbah Eko: percobaan ${percobaan + 1} gagal →`, e.message);
    }
  }

  if (!hasilAI) {
    console.warn(`Mbah Eko: tidak ada respons valid untuk post ${postId}, skip.`);
    return;
  }

  // Jeda sebentar biar tidak terasa robot
  await new Promise(r => setTimeout(r, MBAH_CFG.JEDA_POSTING_MS));

  // Posting ke Supabase
  const berhasil = await postingKomentar(postId, hasilAI);
  if (berhasil) {
    MEMORI.simpanCache(postId, hasilAI);
    if (userId) await MEMORI.simpan(userId, "assistant", hasilAI);
    console.log(`✅ Mbah Eko [${jenis}] post ${postId}:`, hasilAI);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// MESIN UTAMA — scan semua postingan
// ─────────────────────────────────────────────────────────────────────────
let sedangScan = false;

async function scanMading() {
  if (sedangScan) return;
  if (!window.supabaseClient) return;

  const semuaPost = document.querySelectorAll(
    "#feed .post, #userPosts .post, .post, #profilePosts .post, [id^='post-card-']"
  );
  if (!semuaPost.length) return;

  sedangScan = true;

  try {
    for (const post of semuaPost) {
      const postId = post.getAttribute("data-id")
        || post.id?.replace("post-card-", "")
        || post.id;
      if (!postId) continue;

      // Jangan proses post yang sedang dikunci
      if (post.getAttribute("data-mbah-lock") === "true") continue;

      const kontenPost = post.querySelector(".text, .deskripsi-proses")?.innerText?.trim() || "";
      if (!kontenPost) continue;

      // ── SKENARIO 1: POSTINGAN BARU ──────────────────────────────────
      // Mbah belum komentar + belum pernah disapa di sesi ini
      const kunciSapa = `mbah_sapa_${postId}`;
      const belumDisapa = !localStorage.getItem(kunciSapa);
      const sudahPernah = await sudahKomentar(postId);

      if (!sudahPernah && belumDisapa) {
        post.setAttribute("data-mbah-lock", "true");
        localStorage.setItem(kunciSapa, "done");
        try {
          await prosesPost(post, "POSTINGAN_BARU");
        } finally {
          post.removeAttribute("data-mbah-lock");
        }
        break; // Proses satu post per siklus, lanjut di scan berikutnya
      }

      // ── SKENARIO 2: ADA MENTION BELUM DIBALAS ───────────────────────
      // Meski sudah komentar, kalau ada yang mention → balas
      const adaMention = await adaMentionBelumDibalas(postId);
      if (!adaMention) continue;

      // Ambil hash komentar terakhir untuk deteksi apakah sudah dibalas sebelumnya
      const { data: komentarData } = await window.supabaseClient
        .from("comments")
        .select("comment, created_at")
        .eq("post_id", parseInt(postId))
        .order("created_at", { ascending: false })
        .limit(1);

      if (!komentarData || komentarData.length === 0) continue;

      const hashKomen = btoa(
        unescape(encodeURIComponent(komentarData[0].comment || ""))
      ).substring(0, 16);
      const kunciMention = `mbah_mention_${postId}_${hashKomen}`;

      if (localStorage.getItem(kunciMention)) continue; // Sudah dibalas

      post.setAttribute("data-mbah-lock", "true");
      localStorage.setItem(kunciMention, "done");
      try {
        await prosesPost(post, "MENTION");
      } finally {
        post.removeAttribute("data-mbah-lock");
      }
      break; // Satu per siklus
    }
  } catch (err) {
    console.error("Mbah Eko scan error:", err);
  } finally {
    sedangScan = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// OBSERVER — aktif saat DOM berubah (post baru muncul)
// ─────────────────────────────────────────────────────────────────────────
const mbahObserver = new MutationObserver(() => {
  clearTimeout(window._mbahDebounce);
  window._mbahDebounce = setTimeout(scanMading, MBAH_CFG.DEBOUNCE_MS);
});
mbahObserver.observe(document.body, { childList: true, subtree: true });

// Jalankan pertama kali setelah halaman siap
setTimeout(scanMading, 2500);
window.addEventListener("load", () => setTimeout(scanMading, 2500));