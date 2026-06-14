// =========================================================================
// MBAH EKO v3.1 — Bot Komentar ToFarmer (FIXED)
// =========================================================================
// BUG YANG DIPERBAIKI:
//   1. post.getAttribute("data-id") selalu null — postId kini diambil dari div.id
//   2. data-user-id tidak ada di DOM — user_id pemilik post diambil dari DB
//   3. Selector komentar salah — disesuaikan dengan HTML nyata di app.js
//      (komentar ada di #list-komentar-{postId} > div > div > span:last-child)
//   4. Worker lama tidak menerima {systemPrompt, userPrompt} — sudah dipisah
// =========================================================================

console.log("👴 [Mbah Eko v3.1] Bangun dari tidur siang...");

// ─────────────────────────────────────────────────────────────────────────
// KONFIGURASI
// ─────────────────────────────────────────────────────────────────────────
const MBAH_CFG = {
  WORKER_URL: "https://tofarmer-api.tofarmer-api.workers.dev/ai-saran",
  ID_MBAH: "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY",
  BOT_USERNAME: "mbah_eko",
  DEBOUNCE_MS: 1200,
  JEDA_POSTING_MS: 1800,
};

// ─────────────────────────────────────────────────────────────────────────
// KNOWLEDGE BASE TOFARMER
// ─────────────────────────────────────────────────────────────────────────
const TOF_KONTEKS = `
ToFarmer adalah komunitas pertanian berbasis teknologi dengan 5 Pilar:
1. Komunitas & Narasi - gotong royong, dokumentasi, konten
2. Inovasi & Teknologi - AI, robotika, software pertanian
3. Ladang (Proof of Work) - eksperimen nyata di tanah, validasi ilmu
4. Finansial - token TOF, compounding, kemandirian ekonomi
5. Refleksi - filosofi, etika, menjaga nilai gerakan

Sistem XP: aktif posting/komentar/eksperimen = dapat XP, naik level (Grower->Pro->Specialist->Elite).
Token TOF: 1 TOF = Rp1.000. Tujuan: gaji otomatis dari hasil komunitas.
Ilmu Baku: pengetahuan yang sudah diuji berulang di lapangan, bukan sekadar teori.
`.trim();

// ─────────────────────────────────────────────────────────────────────────
// HELPER: AMBIL POST ID DARI ELEMEN
// app.js set id sebagai "post-card-{angka}", TIDAK ada data-id
// ─────────────────────────────────────────────────────────────────────────
function ambilPostId(post) {
  // Cara 1: dari data-id (kalau suatu saat ditambahkan)
  const fromAttr = post.getAttribute("data-id");
  if (fromAttr) return fromAttr;

  // Cara 2: dari id="post-card-123" → ambil "123"
  const fromId = post.id?.replace("post-card-", "");
  if (fromId && fromId !== post.id) return fromId;

  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// HELPER: AMBIL TEKS KOMENTAR DARI DOM
// Struktur nyata (dari app.js):
//   #list-komentar-{postId}
//     div (wrapper)
//       div (bubble)
//         span @username
//         span ISI KOMENTAR  <-- ini yang kita ambil
// ─────────────────────────────────────────────────────────────────────────
function ambilKomentarDariDOM(postId) {
  const listEl = document.getElementById(`list-komentar-${postId}`);
  if (!listEl) return [];

  const hasil = [];
  // Setiap komentar adalah div > div > [span username, span teks]
  const wrapperItems = listEl.querySelectorAll("div > div");
  wrapperItems.forEach(bubble => {
    const spans = bubble.querySelectorAll("span");
    if (spans.length < 2) return;

    const penulis = (spans[0].innerText || "").replace("@", "").trim().toLowerCase();
    const teks = (spans[1].innerText || "").trim();

    if (!teks || penulis === MBAH_CFG.BOT_USERNAME) return;
    if (teks.startsWith("Kirim") || teks.startsWith("Sruput")) return;

    hasil.push({ penulis, teks });
  });

  return hasil;
}

// ─────────────────────────────────────────────────────────────────────────
// MODUL MEMORI
// ─────────────────────────────────────────────────────────────────────────
const MEMORI = {
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
      console.warn("Mbah Eko: gagal simpan memori", e.message);
    }
  },

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

  formatRiwayat(riwayat) {
    if (!riwayat || riwayat.length === 0) return "(belum ada riwayat)";
    return riwayat.map(item => {
      const siapa = item.role === "user"
        ? "Petani"
        : (item.agent === "mbah_eko" ? "Mbah Eko" : "Teman Kebun");
      return `${siapa}: "${item.message}"`;
    }).join("\n");
  },

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

  _cache: {},
  simpanCache(postId, teks) { this._cache[postId] = teks; },
  getCache(postId) { return this._cache[postId] || ""; },
};

// ─────────────────────────────────────────────────────────────────────────
// PEMBUAT PROMPT
// ─────────────────────────────────────────────────────────────────────────
function buatPrompt({ profil, riwayat, kontenPost, komentarBaru, cacheSebelumnya }) {
  const infoUser = profil
    ? `Kamu sedang merespons dari @${profil.username} (XP: ${profil.xp || 0}).`
    : "";

  const antiUlang = cacheSebelumnya
    ? `\nJangan ulangi atau parafrase kalimat ini yang sudah kamu katakan: "${cacheSebelumnya}"\n`
    : "";

  const systemPrompt = `Kamu adalah Mbah Eko, petani senior komunitas ToFarmer.

KARAKTER:
- Gaya bicara santai khas orang tua bijak, sesekali pakai "lha", "nah", "to", "ya" — tapi jangan lebay.
- Jawab seperti ngobrol langsung, bukan ceramah panjang.
- Kalau tidak tahu, jujur: "Mbah belum pernah coba ini, tapi..." — jangan mengada-ada.
- Sesekali tanya balik 1 pertanyaan singkat yang relevan.
- JANGAN mulai dengan "Tentu!", "Baik!", "Benar sekali!", "Halo", atau memanggil nama user.
- JANGAN sebut username kamu sendiri atau tulis @mbah_eko dalam jawaban.

BATAS JAWABAN:
- Maksimal 2-3 kalimat pendek. Kalau ada 2 poin, pisah jadi 2 baris singkat.
- Kalau di luar konteks pertanian/ToFarmer, arahkan balik ke bertani atau komunitas.
- DILARANG memberi instruksi berbahaya.

KONTEKS TOFARMER:
${TOF_KONTEKS}

${infoUser}${antiUlang}`;

  const userPrompt = `RIWAYAT DISKUSI:
${riwayat}

ISI POSTINGAN:
"${kontenPost}"

YANG PERLU DIBALAS:
"${komentarBaru}"

Tulis balasan Mbah Eko (2-3 kalimat, santai, langsung ke inti):`;

  return { systemPrompt, userPrompt };
}

// ─────────────────────────────────────────────────────────────────────────
// PANGGIL AI
// Worker menerima { systemPrompt, userPrompt } → kembalikan { reply }
// Kalau worker lama kamu belum diupdate, ganti dengan worker baru dulu
// ─────────────────────────────────────────────────────────────────────────
async function panggilAI(systemPrompt, userPrompt) {
  const res = await fetch(MBAH_CFG.WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt, userPrompt }),
  });
  if (!res.ok) throw new Error(`Worker HTTP ${res.status}`);
  const json = await res.json();
  // Dukung format lama (saran/reply) maupun format baru (reply)
  return (json.reply || json.saran || "").trim();
}

// ─────────────────────────────────────────────────────────────────────────
// VALIDASI RESPONS
// ─────────────────────────────────────────────────────────────────────────
function responValid(teks, cache) {
  if (!teks || teks.length < 8) return false;
  const awal = teks.toLowerCase().slice(0, 35);
  const robotik = ["tentu saja", "tentu!", "baik!", "benar sekali", "dengan senang hati", "halo ", "hai "];
  if (robotik.some(f => awal.startsWith(f))) return false;
  if (teks.toLowerCase().includes("@mbah_eko")) return false;
  if (cache && cache.length > 10) {
    const sA = new Set(teks.toLowerCase().split(/\s+/));
    const sB = new Set(cache.toLowerCase().split(/\s+/));
    const irisan = [...sA].filter(w => sB.has(w)).length;
    if (irisan / Math.max(sA.size, sB.size) > 0.78) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// CEK DATABASE
// ─────────────────────────────────────────────────────────────────────────
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

// Cek mention: komentar terakhir di DB bukan dari Mbah dan mention @mbah_eko
async function adaMentionBelumDibalas(postId) {
  if (!window.supabaseClient) return { ada: false, hashKomen: "" };
  const { data, error } = await window.supabaseClient
    .from("comments")
    .select("user_id, comment")
    .eq("post_id", parseInt(postId))
    .order("created_at", { ascending: false })
    .limit(5); // ambil 5 terakhir untuk cek apakah ada mention yang belum dibalas

  if (error || !data || data.length === 0) return { ada: false, hashKomen: "" };

  // Cari komentar paling baru yang mention @mbah_eko dan belum dibalas Mbah
  // "belum dibalas" = setelah komentar itu tidak ada komentar dari Mbah Eko
  const reversed = [...data]; // sudah descending, index 0 = paling baru
  
  // Kalau komentar paling baru adalah dari Mbah Eko sendiri → tidak perlu balas
  if (reversed[0].user_id === MBAH_CFG.ID_MBAH) return { ada: false, hashKomen: "" };

  // Kalau komentar paling baru menyebut @mbah_eko → perlu dibalas
  const adaMention = reversed[0].comment
    ?.toLowerCase()
    .includes(`@${MBAH_CFG.BOT_USERNAME}`);

  if (!adaMention) return { ada: false, hashKomen: "" };

  const hashKomen = btoa(
    unescape(encodeURIComponent(reversed[0].comment || ""))
  ).substring(0, 16);

  return { ada: true, hashKomen };
}

// Ambil user_id pemilik post dari tabel contributions
async function ambilUserIdPost(postId) {
  if (!window.supabaseClient) return null;
  try {
    const { data, error } = await window.supabaseClient
      .from("contributions")
      .select("user_id")
      .eq("id", parseInt(postId))
      .single();
    if (error || !data) return null;
    return data.user_id;
  } catch (e) {
    return null;
  }
}

async function postingKomentar(postId, teks) {
  if (!window.supabaseClient) return false;
  const { error } = await window.supabaseClient.from("comments").insert([{
    post_id: parseInt(postId),
    user_id: MBAH_CFG.ID_MBAH,
    comment: teks,
  }]);
  if (error) console.error("Mbah Eko: gagal posting →", error.message);
  return !error;
}

// ─────────────────────────────────────────────────────────────────────────
// PROSES SATU POST
// ─────────────────────────────────────────────────────────────────────────
async function prosesPost(post, jenis) {
  const postId = ambilPostId(post);
  if (!postId) return;

  // Ambil isi postingan dari elemen .text
  const kontenPost = post.querySelector(".text")?.innerText?.trim() || "";
  if (!kontenPost) return;

  // Ambil komentar dari DOM (struktur nyata app.js)
  const daftarKomen = ambilKomentarDariDOM(postId);

  // Target yang dibalas:
  // - MENTION: komentar terakhir yang ada @mbah_eko (sudah divalidasi DB sebelumnya)
  // - POSTINGAN_BARU: isi postingan itu sendiri
  const komentarTarget = daftarKomen.length > 0
    ? daftarKomen[daftarKomen.length - 1].teks
    : kontenPost;

  // Ambil userId pemilik post dari DB (tidak ada di DOM)
  const userId = await ambilUserIdPost(postId);

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

  // Panggil AI (retry 1x kalau tidak valid)
  let hasilAI = "";
  for (let coba = 0; coba < 2; coba++) {
    try {
      const sp = coba === 0
        ? systemPrompt
        : systemPrompt + "\n\nPENTING: Gunakan sudut pandang dan kalimat yang BERBEDA TOTAL dari sebelumnya.";
      hasilAI = await panggilAI(sp, userPrompt);
      if (responValid(hasilAI, cacheSebelumnya)) break;
      hasilAI = "";
    } catch (e) {
      console.warn(`Mbah Eko: percobaan ${coba + 1} gagal`, e.message);
    }
  }

  if (!hasilAI) {
    console.warn(`Mbah Eko: skip post ${postId} — respons tidak valid.`);
    return;
  }

  // Jeda biar tidak terasa robot
  await new Promise(r => setTimeout(r, MBAH_CFG.JEDA_POSTING_MS));

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
  if (!window.supabaseClient) {
    console.warn("Mbah Eko: supabaseClient belum siap, tunggu...");
    return;
  }

  // Selector: semua elemen dengan id="post-card-*"
  const semuaPost = document.querySelectorAll("[id^='post-card-']");
  if (!semuaPost.length) return;

  sedangScan = true;

  try {
    for (const post of semuaPost) {
      const postId = ambilPostId(post);
      if (!postId) continue;
      if (post.getAttribute("data-mbah-lock") === "true") continue;

      const kontenPost = post.querySelector(".text")?.innerText?.trim() || "";
      if (!kontenPost) continue;

      // ── SKENARIO 1: POSTINGAN BARU ─────────────────────────────────
      const kunciSapa = `mbah_sapa_${postId}`;
      if (!localStorage.getItem(kunciSapa)) {
        const pernahKomentar = await sudahKomentar(postId);
        if (!pernahKomentar) {
          post.setAttribute("data-mbah-lock", "true");
          localStorage.setItem(kunciSapa, "done");
          try {
            await prosesPost(post, "POSTINGAN_BARU");
          } finally {
            post.removeAttribute("data-mbah-lock");
          }
          break; // satu per siklus
        } else {
          // Tandai supaya tidak dicek DB lagi di scan berikutnya
          localStorage.setItem(kunciSapa, "done");
        }
      }

      // ── SKENARIO 2: MENTION BELUM DIBALAS ─────────────────────────
      const { ada, hashKomen } = await adaMentionBelumDibalas(postId);
      if (!ada) continue;

      const kunciMention = `mbah_mention_${postId}_${hashKomen}`;
      if (localStorage.getItem(kunciMention)) continue; // sudah dibalas sesi ini

      post.setAttribute("data-mbah-lock", "true");
      localStorage.setItem(kunciMention, "done");
      try {
        await prosesPost(post, "MENTION");
      } finally {
        post.removeAttribute("data-mbah-lock");
      }
      break; // satu per siklus
    }
  } catch (err) {
    console.error("Mbah Eko scan error:", err);
  } finally {
    sedangScan = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// OBSERVER & INISIALISASI
// ─────────────────────────────────────────────────────────────────────────
const mbahObserver = new MutationObserver(() => {
  clearTimeout(window._mbahDebounce);
  window._mbahDebounce = setTimeout(scanMading, MBAH_CFG.DEBOUNCE_MS);
});
mbahObserver.observe(document.body, { childList: true, subtree: true });

setTimeout(scanMading, 3000);
window.addEventListener("load", () => setTimeout(scanMading, 3000));