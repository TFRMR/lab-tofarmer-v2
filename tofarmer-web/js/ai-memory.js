// ============================================================
// ai-memory.js
// Sistem Memori AI Teman Kebun - Lintas Sesi Per User
// Simpan di: js/ai-memory.js
// Load di profile.html SEBELUM profile.js:
//   <script src="js/ai-memory.js"></script>
// ============================================================

const AI_MEMORY = {

  // ============================================================
  // 1. SIMPAN PESAN KE SUPABASE
  // ============================================================
  async simpan(userId, role, message) {
    if (!userId || !message) return;
    try {
      await window.supabaseClient
        .from("ai_chat_history")
        .insert([{ user_id: userId, role, message }]);
    } catch (e) {
      console.log("Gagal simpan memori AI:", e.message);
    }
  },

  // ============================================================
  // 2. AMBIL RIWAYAT CHAT DARI SUPABASE (maks 10 pesan terakhir)
  // ============================================================
  async ambilRiwayat(userId, limit = 10) {
    if (!userId) return [];
    try {
      const { data, error } = await window.supabaseClient
        .from("ai_chat_history")
        .select("role, message, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error || !data) return [];

      // Balik urutan: terlama dulu, terbaru terakhir
      return data.reverse();
    } catch (e) {
      console.log("Gagal ambil riwayat AI:", e.message);
      return [];
    }
  },

  // ============================================================
  // 3. FORMAT RIWAYAT JADI TEKS KONTEKS UNTUK AI
  // ============================================================
  formatRiwayatUntukAI(riwayat) {
    if (!riwayat || riwayat.length === 0) {
      return "- Belum ada riwayat percakapan sebelumnya.";
    }

    return riwayat.map((item) => {
      const tgl = new Date(item.created_at).toLocaleDateString("id-ID");
      // Jika role-nya assistant, kita sebut Mbah Eko
      const label = item.role === "user" ? "Petani" : "Mbah Eko"; 
      return `[${tgl}] ${label}: "${item.message}"`;
    }).join("\n");
  },

  // ============================================================
  // 4. CARI KONTEKS DARI KNOWLEDGE BASE (dari mbah_eko_injector)
  // ============================================================
  cariKnowledgeBase(pertanyaan) {
    // Gunakan fungsi RAG dari mbah_eko_injector jika tersedia
    if (typeof window.cariKonteksPaper === "function") {
      return window.cariKonteksPaper(pertanyaan);
    }

    // Fallback: cari manual dari TOFARMER_PAPER jika tersedia
    if (typeof TOFARMER_PAPER !== "undefined") {
      const q = pertanyaan.toLowerCase();
      let konteks = "";

      if (q.includes("pilar") || q.includes("aksi") || q.includes("teknologi")) {
        konteks += TOFARMER_PAPER.lima_pilar + "\n\n";
      }
      if (q.includes("xp") || q.includes("level") || q.includes("pangkat")) {
        konteks += TOFARMER_PAPER.protokol_xp_level_exit + "\n\n";
      }
      if (q.includes("nabung") || q.includes("aset") || q.includes("compounding")) {
        konteks += TOFARMER_PAPER.strategi_ekonomi_compounding + "\n\n";
      }
      if (q.includes("ilmu") || q.includes("baku") || q.includes("validasi")) {
        konteks += TOFARMER_PAPER.epistemologi_ilmu_baku + "\n\n";
      }
      if (konteks === "") {
        konteks = TOFARMER_PAPER.latar_belakang_filosofi;
      }
      return konteks;
    }

    return "Fokus pada aksi nyata, eksperimen teknis, dan kemandirian komunitas ToFarmer.";
  },

  // ============================================================
  // 5. BANGUN KONTEKS LENGKAP UNTUK AI
  //    (profil + karya + riwayat chat + knowledge base)
  // ============================================================
  async bangunKonteksLengkap(profileData, recentPosts, pertanyaanUser) {
    const userId = profileData?.id || window.currentWallet;

    // A. Ambil riwayat chat dari Supabase
    const riwayat = await this.ambilRiwayat(userId, 10);
    const teksRiwayat = this.formatRiwayatUntukAI(riwayat);

    // B. Cari knowledge base yang relevan
    const knowledgeBase = this.cariKnowledgeBase(pertanyaanUser);

    // C. Format karya terakhir
    const teksKarya = recentPosts && recentPosts.length > 0
      ? recentPosts.slice(0, 5).map((post, i) => {
          const tgl = new Date(post.created_at).toLocaleDateString("id-ID");
          return `[Karya ${i + 1} - ${tgl}]: "${post.deskripsi_proses}"`;
        }).join("\n")
      : "- Belum ada karya tercatat.";

    // D. Gabungkan semua konteks
    return `
========================================
DATA PROFIL PETANI:
========================================
- Username: @${profileData?.username || "Petani"}
- Level: ${typeof getTofLevel === "function" ? getTofLevel(profileData?.xp || 0) : "?"} 
- Rank: ${typeof getRank === "function" ? getRank(profileData?.xp || 0) : "?"}
- XP: ${profileData?.xp || 0} | TOF: ${profileData?.saldo_tof || 0}

========================================
KARYA TERAKHIR DI LADANG:
========================================
${teksKarya}

========================================
RIWAYAT PERCAKAPAN SEBELUMNYA (MEMORI):
========================================
${teksRiwayat}

========================================
PENGETAHUAN TOFARMER YANG RELEVAN:
========================================
${knowledgeBase}
    `.trim();
  }
};

// Expose ke window agar bisa dipakai di file lain
window.AI_MEMORY = AI_MEMORY;
// Daftarkan ke window agar bisa diakses di file lain
window.MBAH_EKO_MEMORY = AI_MEMORY;