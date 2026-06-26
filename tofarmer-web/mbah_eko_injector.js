(function () {
    console.log("👴 [Mbah Eko] Kurator Ilmu Mikro Aktif (Mode Analisis Per User & Autocomplete)...");

    const BOT_USER_ID = "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY";
    const DB = window.supabaseClient;

    // Daftar user_id yang tidak boleh dikurasi (akun bot / sistem)
    const BLACKLIST_USER_IDS = [
        BOT_USER_ID,                                                              // Mbah Eko sendiri
        "HVYBLWO7XBPO76SP7KBBYZ5ZVTCPWA5Z4RTVCYBH4IBL3GJFV5DBZTWNMI"           // TOPLES_ECOSYSTEM (bot akuntansi)
    ];

   const GATE3_INSTRUCTION = `INSTRUKSI TUGAS: Anda adalah sistem kurator ilmu mikro untuk ekosistem multidisplin ToFarmer.
    TUGAS: Menganalisis KUMPULAN catatan/postingan dari SATU USER untuk ditarik kesimpulan menjadi sebuah SOP yang FOKUS dan LOGIS.
    
    ⚠️ PERINGATAN GAYA BAHASA: WAJIB pertahankan gaya bahasa asli, istilah lokal, kosakata unik, dan karakter mengetik dominan dari data asli. Rapikan hanya typo yang parah.
    
    ⚠️ SISTEM DETEKSI DUA JALUR (WAJIB):
    Sebelum menulis, analisis dengan jeli apakah kumpulan data user ini berisi "Ilmu Serius" atau "Candaan/Metafora Fiktif":
    
    1. JALUR SERIUS (Jika isinya panduan riil dari 5 Pilar ToFarmer):
       Rakit menjadi SOP Baku formal yang aman, masuk akal, dan aplikatif di dunia nyata.
       
    2. JALUR PARODI / GUYOAN (Jika isinya banyolan, khayalan, atau metafora konyol seperti membuat candi semalam, ternak naga, dll):
       JANGAN DITOLAK! Tetap rakit menjadi SOP, tetapi dengan format "SOP PARODI / GUYOAN WARUNG KOPI". Gunakan sudut pandang komedi, sarkasme halus, atau humor lokal yang menghibur komunitas Pilar 1 (Narasi Kreatif), tetapi langkah-langkahnya tetap harus tersusun runtut mengikuti logika banyolan tersebut (Jangan dicocoklogikan sok serius ke blockchain atau pertanian biologis!).
    
    Langkah Kerja:
    1. Filter Awal: Jika teks murni spam satu kata, curhat kosong tanpa alur, atau tidak bisa dibikin SOP sama sekali, jawab HANYA dengan satu kata: TIDAK
    2. Jika lolos (baik serius maupun guyon), rakit menggunakan format:
       - JUDUL: [Nama SOP - Jika guyon, wajib tambahkan teks "(SOP PARODI)" di judulnya]
       - KONSEP DASAR: [Penjelasan inti dari pilar atau latar belakang guyonan tersebut dibuat]
       - PERSIAPAN: [Alat/Bahan yang disebutkan di tulisan user, atau pelengkap yang lucu/relevan]
       - SOP TEKNIS: [Urutan langkah kumulatif yang runtut dan berurutan sesuai jalur yang dipilih]
       - PARAMETER KEBERHASILAN: [Indikator keberhasilan yang jelas, terukur, atau menggelitik jika itu parodi]
       - MITIGASI RISIKO: [Hal-hal yang harus diwaspadai dari praktik tersebut]`;

    const VOTING_INSTRUCTION = `Anda adalah analis sentimen komunitas petani.
    Baca kumpulan komentar berikut dan tentukan apakah komunitas SETUJU atau TIDAK SETUJU bahwa konten ini adalah ilmu bermanfaat.
    Komentar yang menunjukkan SETUJU: kata seperti "bagus", "bermanfaat", "mantap", "setuju", "cocok", "benar", "oke", "yes", "👍", dll.
    Komentar yang menunjukkan TIDAK SETUJU: kata seperti "tidak", "salah", "kurang", "jelek", "nggak", "beda", "keliru", "👎", dll.
    Jawab HANYA dengan JSON valid tanpa teks lain, tanpa markdown, tanpa penjelasan apapun.
    Format wajib: {"ya": NUMBER, "tidak": NUMBER}`;



   // ─── FUNGSI UTAMA: KURATOR (Dengan Fitur Pengocok Acak / Adil) ────────

    async function jalankanKurator() {
        try {
            const hariIni = new Date().toISOString().split('T')[0];

            // 1. Cek limit harian bot Mbah Eko sendiri
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

            // 2. Ambil pool data mentah LEBIH BANYAK (Limit dinaikkan ke 100 agar user pasif ikut ketarik)
            const { data: posts, error: errPosts } = await DB
                .from("contributions")
                .select("id, deskripsi_proses, user_id, judul_aksi")
                .or("deskripsi_proses.ilike.%cara %,deskripsi_proses.ilike.%bikin %,deskripsi_proses.ilike.%trik %,deskripsi_proses.ilike.%langkah %,deskripsi_proses.ilike.%tutorial %")
                .order("created_at", { ascending: false })
                .limit(100); 

            if (errPosts) {
                console.error("❌ [Mbah Eko] Gagal ambil postingan:", errPosts.message);
                return;
            }

            if (!posts || posts.length === 0) {
                console.log("ℹ️ [Mbah Eko] Tidak ada postingan relevan ditemukan.");
                return;
            }

            // 3. Kelompokkan postingan berdasarkan user_id (Group by User)
            const grupUser = {};
            for (const post of posts) {
                if (BLACKLIST_USER_IDS.includes(post.user_id)) continue;
                if (post.judul_aksi && (post.judul_aksi.includes("SOP Baku") || post.judul_aksi.includes("Hasil Telaah"))) continue;

                if (!grupUser[post.user_id]) {
                    grupUser[post.user_id] = [];
                }
                grupUser[post.user_id].push(post);
            }

           // 4. 🎰 PROSES KOCOK ARISAN MODEL TOGEL (ACAK MURNI)
            // Ambil semua daftar key user_id yang terjaring
            let semuaDaftarUser = Object.keys(grupUser);
            
            // Kita petakan user ke dalam bentuk objek yang diberi "Skor Keberuntungan" acak murni.
            // Rumus: Menggabungkan angka acak pecahan pecahan terkecil dengan sisa pembagian waktu mili-detik saat ini.
            semuaDaftarUser = semuaDaftarUser
                .map(userId => ({
                    id: userId,
                    skorTogel: Math.random() * (Date.now() % 1000)
                }))
                // Urutkan dari skor yang paling besar ke kecil (seperti bola togel yang menggelinding keluar)
                .sort((a, b) => b.skorTogel - a.skorTogel)
                // Kembalikan lagi ke format array string user_id
                .map(user => user.id);

            console.log(`🎰 [Mbah Eko] Hasil kocokan bola togel antrean hari ini:`, semuaDaftarUser);
            // 5. Analisis target berdasarkan antrean yang sudah DIACAK
            for (const targetUserId of semuaDaftarUser) {
                const koleksiPost = grupUser[targetUserId];

                // PROTEKSI GERBANG B: Cek tabel ilmu_pending (level USER, bukan per-post)
                const { data: cekPending, error: errCekPending } = await DB
                    .from("ilmu_pending")
                    .select("id")
                    .eq("user_id", targetUserId)
                    .limit(1);

                if (errCekPending) {
                    console.error(`❌ [Mbah Eko] Gagal cek tabel ilmu_pending:`, errCekPending.message);
                    continue;
                }

                if (cekPending && cekPending.length > 0) {
                    console.log(`ℹ️ [Mbah Eko] User ${targetUserId} punya draf menggantung di ilmu_pending, skip ke user lain.`);
                    continue;
                }

                // PROTEKSI GERBANG C: Cek tabel ilmu_baku (level USER, bukan per-post)
                const { data: cekBaku, error: errCekBaku } = await DB
                    .from("ilmu_baku")
                    .select("id")
                    .eq("user_id", targetUserId)
                    .limit(1);

                if (errCekBaku) {
                    console.error(`❌ [Mbah Eko] Gagal cek tabel ilmu_baku:`, errCekBaku.message);
                    continue;
                }

                if (cekBaku && cekBaku.length > 0) {
                    console.log(`ℹ️ [Mbah Eko] User ${targetUserId} ilmunya sudah berstatus BAKU, skip ke user lain.`);
                    continue;
                }

                // PROTEKSI GERBANG A: Cari post jangkar yang BELUM pernah dikurasi
                // Loop semua post milik user ini, pakai yang pertama belum tercatat
                let postJangkar = null;
                for (const kandidatPost of koleksiPost) {
                    const { data: cekKurasi, error: errCekKurasi } = await DB
                        .from("mbah_eko_kurasi")
                        .select("id")
                        .eq("post_id", kandidatPost.id)
                        .limit(1);

                    if (errCekKurasi) {
                        console.error(`❌ [Mbah Eko] Gagal cek tabel mbah_eko_kurasi:`, errCekKurasi.message);
                        break;
                    }

                    if (!cekKurasi || cekKurasi.length === 0) {
                        postJangkar = kandidatPost; // Ketemu post yang belum dikurasi!
                        break;
                    }
                    console.log(`ℹ️ [Mbah Eko] Post ${kandidatPost.id} sudah tercatat, coba post lain milik user yang sama...`);
                }

                if (!postJangkar) {
                    console.log(`ℹ️ [Mbah Eko] Semua post user ${targetUserId} sudah pernah dikurasi, skip ke user lain.`);
                    continue;
                }

                // 6. Jika lolos semua gerbang proteksi, gabungkan rekam jejak teksnya
                let gabunganTeks = "";
                koleksiPost.forEach((p, index) => {
                    gabunganTeks += `[Tulisan #${index + 1} - Judul: ${p.judul_aksi || 'Tanpa Judul'}]:\n${p.deskripsi_proses}\n\n`;
                });

                console.log(`🧠 [Mbah Eko] Memulai telaah kumulatif AMAN & ADIL untuk user: ${targetUserId}`);

                // 7. Tembak ke AI
                const draftSOP = await fetchAI(gabunganTeks);

                if (!draftSOP || draftSOP.trim().toUpperCase() === "TIDAK") {
                    console.log(`ℹ️ [Mbah Eko] Hasil telaah untuk user ${targetUserId} ditolak sistem AI (bukan ilmu mikro). Mencoba user berikutnya di antrean acak...`);
                    continue; // Jika AI bilang TIDAK, perulangan lanjut mencari kandidat user acak berikutnya
                }

                // 8. Ambil nama profil asli
                const { data: userProfile, error: errProfile } = await DB
                    .from("profiles")
                    .select("username")
                    .eq("id", targetUserId)
                    .maybeSingle();

                const username = userProfile?.username || "kawan";

                // 9. Kunci data ke log kurasi internal
                const { error: errInsertKurasi } = await DB
                    .from("mbah_eko_kurasi")
                    .insert([{
                        post_id: postJangkar.id,
                        pencetus_user_id: targetUserId,
                        draft_content: draftSOP,
                        status_kurasi: 'DRAFT'
                    }]);

                if (errInsertKurasi) {
                    console.error(`❌ [Mbah Eko] Gagal mengunci log kurasi internal:`, errInsertKurasi.message);
                    continue;
                }

                // 10. Terbitkan ke feed utama
                const kontenFinal = `Setelah mengamati beberapa catatan penting dari @${username}, saya kumpulkan intisari ilmu berjalannya menjadi satu SOP terintegrasi. Matur nuwun konsistensinya, mari kita bedah bersama:\n\n${draftSOP}`;

                const { error: errPostFeed } = await DB
                    .from("contributions")
                    .insert([{
                        user_id: BOT_USER_ID,
                        judul_aksi: `Hasil Telaah Ilmu: @${username}`,
                        deskripsi_proses: kontenFinal
                    }]);

                if (errPostFeed) {
                    console.error("❌ [Mbah Eko] Gagal menerbitkan hasil kurasi ke feed:", errPostFeed.message);
                    continue;
                }

                console.log(`✅ [Mbah Eko] Sukses merilis SOP tunggal secara acak & adil untuk user @${username}`);
                break; // Selesai! Cukup 1 karya sukses per sesi harian.
            }

        } catch (err) {
            console.error("❌ [Mbah Eko] Crash tidak terduga di jalankanKurator:", err);
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
                    console.log(`ℹ️ [Mbah Eko] Draf jangkar ${draf.post_id} baru memiliki ${comments?.length || 0} komentar, belum cukup untuk voting.`);
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
                            judul_aksi: "Kurasi Komunitas Mbah Eko",
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
            // Batasi panjang akumulasi teks (3000 karakter) agar payload tidak overload ke Cloudflare Worker
            const teksRingkas = (data || "").substring(0, 3000);
            
            const res = await fetch("https://tofarmer-api.tofarmer-api.workers.dev/ai-saran", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    teks: `${GATE3_INSTRUCTION}\n\nKUMPULAN DATA USER:\n${teksRingkas}`,
                    trigger: "Gate3-Compile" 
                })
            });

            if (!res.ok) throw new Error("Server Worker Error");
            
            const json = await res.json();
            return json.reply || json.saran || "TIDAK";
        } catch (err) {
            console.error("⚠️ [Mbah Eko] Gagal hubungi Worker untuk kompilasi data user.");
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
            const clean = raw.replace(/```json|```/gi, "").trim();
            const parsed = JSON.parse(clean);

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