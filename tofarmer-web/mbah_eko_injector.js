(function () {
    console.log("👴 [Mbah Eko] Kurator Ilmu Mikro Aktif...");

    const BOT_USER_ID = "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY";
    const DB = window.supabaseClient;

    // Daftar user_id yang tidak boleh dikurasi (akun bot / sistem)
    const BLACKLIST_USER_IDS = [
        BOT_USER_ID,                                                              // Mbah Eko sendiri
        "HVYBLWO7XBPO76SP7KBBYZ5ZVTCPWA5Z4RTVCYBH4IBL3GJFV5DBZTWNMI"           // TOPLES_ECOSYSTEM (bot akuntansi)
    ];

    const GATE3_INSTRUCTION = `INSTRUKSI TUGAS: Anda adalah ahli kurasi ilmu mikro petani. 
    ⚠️ PERINGATAN: WAJIB pertahankan gaya bahasa asli, istilah lokal, kosakata unik, dan karakter mengetik dari data. Rapikan hanya typo parah.
    
    Tugas Anda:
    1. Filter KETAT — jawab hanya dengan kata TIDAK jika salah satu kondisi ini terpenuhi:
       - Data BUKAN panduan teknis langkah-demi-langkah (how-to)
       - Data TIDAK ADA hubungannya sama sekali dengan pertanian, berkebun, bercocok tanam, peternakan, perikanan, alat pertanian, pupuk, pestisida, benih, panen, irigasi, tanah, hama, penyakit tanaman, atau kegiatan agrikultur lainnya
    2. Jika lolos kedua filter di atas, rakit menjadi SOP Baku dengan format:
       - JUDUL: [Nama asli]
       - KONSEP DASAR: [Penjelasan inti]
       - PERSIAPAN: [Alat/Bahan]
       - SOP TEKNIS: [Urutan langkah asli]
       - PARAMETER KEBERHASILAN: [Indikator]
       - MITIGASI RISIKO: [Jaga-jaga]`;

    const VOTING_INSTRUCTION = `Anda adalah analis sentimen komunitas petani.
    Baca kumpulan komentar berikut dan tentukan apakah komunitas SETUJU atau TIDAK SETUJU bahwa konten ini adalah ilmu bermanfaat.
    Komentar yang menunjukkan SETUJU: kata seperti "bagus", "bermanfaat", "mantap", "setuju", "cocok", "benar", "oke", "yes", "👍", dll.
    Komentar yang menunjukkan TIDAK SETUJU: kata seperti "tidak", "salah", "kurang", "jelek", "nggak", "beda", "keliru", "👎", dll.
    Jawab HANYA dengan JSON valid tanpa teks lain, tanpa markdown, tanpa penjelasan apapun.
    Format wajib: {"ya": NUMBER, "tidak": NUMBER}`;

    // ─── FUNGSI UTAMA: KURATOR (Detection & Drafting) ────────────────────

    async function jalankanKurator() {
        try {
            const hariIni = new Date().toISOString().split('T')[0];

            // 1. Cek limit: 1 postingan per hari oleh Mbah Eko
            const { data: logHariIni, error: errLog } = await DB
                .from("contributions")
                .select("id")
                .eq("user_id", BOT_USER_ID)
                .gte("created_at", hariIni)
                .limit(1);

            if (errLog) {
                console.error("❌ [Mbah Eko] Gagal cek log harian:", errLog.message);
                return;
            }

            if (logHariIni && logHariIni.length > 0) {
                console.log("ℹ️ [Mbah Eko] Sudah posting hari ini, skip.");
                return;
            }

            // 2. Ambil postingan terbaru yang mengandung kata kunci instruksi mikro
            const { data: posts, error: errPosts } = await DB
                .from("contributions")
                .select("id, deskripsi_proses, user_id, judul_aksi")
                .or("deskripsi_proses.ilike.%cara %,deskripsi_proses.ilike.%bikin %,deskripsi_proses.ilike.%trik %,deskripsi_proses.ilike.%langkah %,deskripsi_proses.ilike.%tutorial %")
                .order("created_at", { ascending: false })
                .limit(5);

            if (errPosts) {
                console.error("❌ [Mbah Eko] Gagal ambil postingan:", errPosts.message);
                return;
            }

            if (!posts || posts.length === 0) {
                console.log("ℹ️ [Mbah Eko] Tidak ada postingan relevan ditemukan.");
                return;
            }

            for (const post of posts) {
                // Cek blacklist: jangan kurasi postingan dari bot lain atau diri sendiri
                if (BLACKLIST_USER_IDS.includes(post.user_id)) {
                    console.log(`🚫 [Mbah Eko] Post ${post.id} dari akun terlarang (${post.user_id}), skip.`);
                    continue;
                }

                // Cek apakah sudah diproses — pakai maybeSingle() agar tidak throw error saat data kosong
                const { data: cekProses, error: errCek } = await DB
                    .from("mbah_eko_kurasi")
                    .select("id")
                    .eq("post_id", post.id)
                    .maybeSingle();

                if (errCek) {
                    console.error(`❌ [Mbah Eko] Gagal cek duplikat post ${post.id}:`, errCek.message);
                    continue;
                }

                if (cekProses) {
                    console.log(`ℹ️ [Mbah Eko] Post ${post.id} sudah pernah diproses, skip.`);
                    continue;
                }

                // 3. AI Validasi & Drafting
                const draftSOP = await fetchAI(post.deskripsi_proses);

                // Abaikan jika bukan ilmu mikro
                if (!draftSOP || draftSOP.trim().toUpperCase() === "TIDAK") {
                    console.log(`ℹ️ [Mbah Eko] Post ${post.id} bukan ilmu mikro, dilewati.`);
                    continue;
                }

                // 4. Ambil username untuk mention
                const { data: userProfile, error: errProfile } = await DB
                    .from("profiles")
                    .select("username")
                    .eq("id", post.user_id)
                    .maybeSingle();

                if (errProfile) {
                    console.error(`❌ [Mbah Eko] Gagal ambil profil user ${post.user_id}:`, errProfile.message);
                }

                const username = userProfile?.username || "kawan";

                // 5. Simpan ke database kurasi
                const { error: errKurasi } = await DB
                    .from("mbah_eko_kurasi")
                    .insert([{
                        post_id: post.id,
                        pencetus_user_id: post.user_id,
                        draft_content: draftSOP,
                        status_kurasi: 'DRAFT'
                    }]);

                if (errKurasi) {
                    console.error(`❌ [Mbah Eko] Gagal simpan kurasi post ${post.id}:`, errKurasi.message);
                    continue;
                }

                // 6. Posting ke Feed (Tabel contributions)
                const kontenFinal = `Sari ilmu dari @${username}, matur nuwun idenya! Mari kita bedah SOP-nya:\n\n${draftSOP}`;

                const { error: errPost } = await DB
                    .from("contributions")
                    .insert([{
                        user_id: BOT_USER_ID,
                        judul_aksi: `SOP Baku: ${post.judul_aksi || "Ilmu Mikro"}`,
                        deskripsi_proses: kontenFinal
                    }]);

                if (errPost) {
                    console.error("❌ [Mbah Eko] Gagal posting ke feed:", errPost.message);
                    continue;
                }

                console.log(`✅ [Mbah Eko] Berhasil kurasi dan posting SOP dari post ${post.id}`);
                break; // Hanya proses 1 ilmu per hari
            }

        } catch (err) {
            console.error("❌ [Mbah Eko] Error tidak terduga di jalankanKurator:", err);
        }
    }

    // ─── ANALISA VOTING & INTEGRASI KE ILMU PENDING ──────────────────────

    async function prosesVoting() {
        try {
            const { data: drafs, error: errDrafs } = await DB
                .from("mbah_eko_kurasi")
                .select("id, post_id, pencetus_user_id, draft_content")
                .eq("status_kurasi", 'DRAFT');

            if (errDrafs) {
                console.error("❌ [Mbah Eko] Gagal ambil draf kurasi:", errDrafs.message);
                return;
            }

            if (!drafs || drafs.length === 0) {
                console.log("ℹ️ [Mbah Eko] Tidak ada draf yang menunggu voting.");
                return;
            }

            for (const draf of drafs) {
                const { data: comments, error: errComments } = await DB
                    .from("comments")
                    .select("comment")
                    .eq("post_id", draf.post_id);

                if (errComments) {
                    console.error(`❌ [Mbah Eko] Gagal ambil komentar post ${draf.post_id}:`, errComments.message);
                    continue;
                }

                if (!comments || comments.length < 5) {
                    console.log(`ℹ️ [Mbah Eko] Post ${draf.post_id} baru ${comments?.length || 0} komentar, belum cukup untuk voting.`);
                    continue;
                }

                const hasil = await fetchVoting(comments);

                if (hasil === null) {
                    console.error(`❌ [Mbah Eko] Gagal parse hasil voting untuk draf ${draf.id}, skip.`);
                    continue;
                }

                console.log(`📊 [Mbah Eko] Hasil voting draf ${draf.id}: YA=${hasil.ya}, TIDAK=${hasil.tidak}`);

                if (hasil.ya >= hasil.tidak) {
                    // Masukkan ke ilmu_pending agar muncul di dashboard manual
                    const { error: errPending } = await DB
                        .from("ilmu_pending")
                        .insert([{
                            user_id: draf.pencetus_user_id,
                            judul_aksi: "Kurasi Mbah Eko",
                            deskripsi_proses: draf.draft_content,
                            pilar_aksi: 0,
                            total_vote: hasil.ya
                        }]);

                    if (errPending) {
                        console.error(`❌ [Mbah Eko] Gagal insert ilmu_pending draf ${draf.id}:`, errPending.message);
                        continue;
                    }

                    const { error: errUpdate } = await DB
                        .from("mbah_eko_kurasi")
                        .update({ status_kurasi: 'BAKU' })
                        .eq("id", draf.id);

                    if (errUpdate) {
                        console.error(`❌ [Mbah Eko] Gagal update status BAKU draf ${draf.id}:`, errUpdate.message);
                        continue;
                    }

                    console.log(`✅ [Mbah Eko] Draf ${draf.id} disetujui komunitas → status BAKU`);
                } else {
                    const { error: errReject } = await DB
                        .from("mbah_eko_kurasi")
                        .update({ status_kurasi: 'REJECTED' })
                        .eq("id", draf.id);

                    if (errReject) {
                        console.error(`❌ [Mbah Eko] Gagal update status REJECTED draf ${draf.id}:`, errReject.message);
                        continue;
                    }

                    console.log(`🚫 [Mbah Eko] Draf ${draf.id} ditolak komunitas → status REJECTED`);
                }
            }

        } catch (err) {
            console.error("❌ [Mbah Eko] Error tidak terduga di prosesVoting:", err);
        }
    }

    // ─── AI HELPERS ──────────────────────────────────────────────────────

    async function fetchAI(data) {
        try {
            const res = await fetch("https://tofarmer-api.tofarmer-api.workers.dev/ai-saran", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: `${GATE3_INSTRUCTION}\n\nREFERENSI DATA: ${data}`,
                    trigger: "Gate3-Compile"
                })
            });

            if (!res.ok) {
                console.error(`❌ [Mbah Eko] fetchAI HTTP error: ${res.status}`);
                return "TIDAK";
            }

            const json = await res.json();
            return json.reply || "TIDAK";

        } catch (err) {
            console.error("❌ [Mbah Eko] fetchAI gagal:", err);
            return "TIDAK";
        }
    }

    async function fetchVoting(comments) {
        try {
            const text = comments.map(c => c.comment).join(" | ");

            const res = await fetch("https://tofarmer-api.tofarmer-api.workers.dev/ai-saran", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: `${VOTING_INSTRUCTION}\n\nKOMENTAR: "${text}"`,
                    trigger: "Gate3-Voting"
                })
            });

            if (!res.ok) {
                console.error(`❌ [Mbah Eko] fetchVoting HTTP error: ${res.status}`);
                return null;
            }

            const raw = await res.text();

            // Bersihkan markdown fence jika ada (```json ... ```)
            const clean = raw.replace(/```json|```/gi, "").trim();

            const parsed = JSON.parse(clean);

            // Validasi struktur hasil
            if (typeof parsed.ya !== "number" || typeof parsed.tidak !== "number") {
                console.error("❌ [Mbah Eko] Struktur JSON voting tidak valid:", parsed);
                return null;
            }

            return parsed;

        } catch (err) {
            console.error("❌ [Mbah Eko] fetchVoting gagal parse JSON:", err);
            return null;
        }
    }

    // ─── RUNNER ──────────────────────────────────────────────────────────
    setInterval(jalankanKurator, 3600000);
    setInterval(prosesVoting, 3600000);
    jalankanKurator();
    prosesVoting();

})();