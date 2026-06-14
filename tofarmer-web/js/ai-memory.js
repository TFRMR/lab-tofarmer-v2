// ============================================================
// ai-memory.js - Sistem Memori AI (RAG Ready)
// ============================================================

const AI_MEMORY = {

  // FUNGSI BARU: Generate Embedding (Dimensi 1024)
  async generateEmbedding(text) {
    try {
      const res = await fetch("https://tofarmer-api.tofarmer-api.workers.dev/embed", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      return data.embedding; // Mengembalikan array 1024
    } catch (e) {
      console.error("Gagal generate embedding:", e);
      return null;
    }
  },

  // 1. SIMPAN PESAN (Ditambah Embedding)
  async simpan(userId, role, message, agent = "mbah_eko") {
    if (!userId || !message) return;
    
    const embedding = await this.generateEmbedding(message);

    try {
      await window.supabaseClient
        .from("ai_chat_history")
        .insert([{ 
          user_id: userId, 
          role, 
          message, 
          agent,
          embedding // Menyimpan vektor untuk pencarian makna
        }]);
    } catch (e) {
      console.log("Gagal simpan memori AI:", e.message);
    }
  },

  // 2. CARI KONTEKS (RAG - Menggantikan/Melengkapi ambilRiwayat)
  async cariKonteksSerupa(userId, queryTeks, match_threshold = 0.7, limit = 5) {
    if (!userId) return [];
    
    const queryEmbedding = await this.generateEmbedding(queryTeks);
    if (!queryEmbedding) return [];

    try {
      // Menggunakan fungsi RPC "match_chat_history" yang sudah dibuat di SQL
      const { data, error } = await window.supabaseClient
        .rpc('match_chat_history', {
          query_embedding: queryEmbedding,
          match_threshold: match_threshold,
          match_count: limit,
          filter_user_id: userId
        });

      if (error || !data) return [];
      return data.reverse(); // Urutan kronologis
    } catch (e) {
      console.log("Gagal RAG AI:", e.message);
      return [];
    }
  },

  // 3. FORMAT RIWAYAT
  formatRiwayatUntukAI(riwayat) {
    if (!riwayat || riwayat.length === 0) {
      return "- Belum ada riwayat percakapan sebelumnya.";
    }
    return riwayat.map((item) => {
      const tgl = new Date(item.created_at || new Date()).toLocaleDateString("id-ID");
      const label = item.role === "user" ? "Petani" : "Mbah Eko"; 
      return `[${tgl}] ${label}: "${item.message}"`;
    }).join("\n");
  },

  // 4. CARI KNOWLEDGE BASE
  cariKnowledgeBase(pertanyaan) {
    if (typeof window.cariKonteksPaper === "function") {
      return window.cariKonteksPaper(pertanyaan);
    }
    if (typeof TOFARMER_PAPER !== "undefined") {
      const q = pertanyaan.toLowerCase();
      let konteks = "";
      if (q.includes("pilar") || q.includes("aksi") || q.includes("teknologi")) konteks += TOFARMER_PAPER.lima_pilar + "\n\n";
      if (q.includes("xp") || q.includes("level") || q.includes("pangkat")) konteks += TOFARMER_PAPER.protokol_xp_level_exit + "\n\n";
      if (q.includes("nabung") || q.includes("aset") || q.includes("compounding")) konteks += TOFARMER_PAPER.strategi_ekonomi_compounding + "\n\n";
      if (q.includes("ilmu") || q.includes("baku") || q.includes("validasi")) konteks += TOFARMER_PAPER.epistemologi_ilmu_baku + "\n\n";
      return konteks === "" ? TOFARMER_PAPER.latar_belakang_filosofi : konteks;
    }
    return "Fokus pada aksi nyata, eksperimen teknis, dan kemandirian komunitas ToFarmer.";
  },

  // 5. BANGUN KONTEKS LENGKAP
  async bangunKonteksLengkap(profileData, recentPosts, pertanyaanUser) {
    const userId = profileData?.id || window.currentWallet;

    // A. Mengambil memori relevan via RAG (Bukan lagi sekadar 10 pesan terakhir)
    const riwayat = await this.cariKonteksSerupa(userId, pertanyaanUser, 0.7, 5);
    const teksRiwayat = this.formatRiwayatUntukAI(riwayat);

    // B. Cari knowledge base
    const knowledgeBase = this.cariKnowledgeBase(pertanyaanUser);

    // C. Format karya
    const teksKarya = recentPosts && recentPosts.length > 0
      ? recentPosts.slice(0, 5).map((post, i) => {
          const tgl = new Date(post.created_at).toLocaleDateString("id-ID");
          return `[Karya ${i + 1} - ${tgl}]: "${post.deskripsi_proses}"`;
        }).join("\n")
      : "- Belum ada karya tercatat.";

    return `
========================================
DATA PROFIL PETANI:
========================================
- Username: @${profileData?.username || "Petani"}
- Level: ${typeof getTofLevel === "function" ? getTofLevel(profileData?.xp || 0) : "?"} 
- XP: ${profileData?.xp || 0} | TOF: ${profileData?.saldo_tof || 0}

========================================
KARYA TERAKHIR DI LADANG:
========================================
${teksKarya}

========================================
MEMORI RELEVAN (Pencarian Semantik):
========================================
${teksRiwayat}

========================================
PENGETAHUAN TOFARMER:
========================================
${knowledgeBase}
    `.trim();
  }
};

window.AI_MEMORY = AI_MEMORY;
window.MBAH_EKO_MEMORY = AI_MEMORY;