(function () {
    console.log("👴 [Mbah Eko] Kurator Ilmu Mikro Aktif (Mode Analisis Per User & Autocomplete)...");

    /*
     * ⚠️ PRASYARAT SKEMA DATABASE untuk versi ini — jalankan mbah_eko_migration.sql dulu sebelum deploy.
     * Ringkasan:
     * 1. Tabel BARU "mbah_eko_giliran" — user_id (text, PRIMARY KEY), last_attempt_at (timestamptz).
     *    Dipakai buat fair queue, gantiin kocokan acak murni.
     * 2. Tabel "mbah_eko_kurasi" — tambah kolom pilar_aksi (integer) dan jalur (text).
     *    status_kurasi sekarang juga bisa berisi 'REJECTED_AI' (di luar 'DRAFT' | 'BAKU' | 'REJECTED' yang lama) —
     *    cek dulu kalau kolom itu punya CHECK constraint pembatas nilai (lihat catatan di file SQL).
     * 3. Tabel "ilmu_pending" & "ilmu_baku" — pilar_aksi (integer) sudah ada & dikonfirmasi. Tambah kolom jalur (text).
     *
     * ⚠️ CATATAN PILAR: pilar_aksi itu INTEGER, bukan string. Cuma Pilar 1 = "Narasi Kreatif" yang confirmed
     * dari teks GATE3_INSTRUCTION di bawah (nampung SOP PARODI/guyonan). Pilar 2-5 di PILAR_KEYWORDS masih
     * TEBAKAN placeholder pola SOP pertanian umum — ganti sesuai definisi asli 5 Pilar ToFarmer kamu.
     */

    const BOT_USER_ID = "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY";
    const DB = window.supabaseClient;

    // Daftar user_id yang tidak boleh dikurasi (akun bot / sistem)
    const BLACKLIST_USER_IDS = [
        BOT_USER_ID,                                                              // Mbah Eko sendiri
        "HVYBLWO7XBPO76SP7KBBYZ5ZVTCPWA5Z4RTVCYBH4IBL3GJFV5DBZTWNMI"           // TOPLES_ECOSYSTEM (bot akuntansi)
    ];

    // ─── PETA PILAR (buat Gerbang berbasis pilar_aksi, bukan level user) ──
    // Pilar 1 dikonfirmasi = "Narasi Kreatif" (dipakai GATE3_INSTRUCTION buat konten SOP PARODI).
    const PILAR_NARASI_KREATIF = 1;

    // ⚠️ Pilar 2-5 di bawah ini TEBAKAN berdasarkan pola SOP pertanian umum — GANTI sesuai definisi
    // asli 5 Pilar ToFarmer kamu. Cuma dipakai buat GATING (skip/lanjut), bukan isi SOP, jadi gak
    // fatal kalau kadang meleset — hasil akhirnya tetap disaring lagi lewat voting komunitas.
    const PILAR_KEYWORDS = {
        2: ["kompos", "pupuk", "bokashi", "pupuk kandang"],
        3: ["irigasi", "nyiram", "penyiraman", "drip", "sumur bor"],
        4: ["hama", "penyakit", "jamur", "ulat", "pestisida"],
        5: ["bibit", "benih", "semai", "stek", "cangkok", "panen"],
    };

    function tebakPilar(judul, deskripsi) {
        const teks = `${judul || ""} ${deskripsi || ""}`.toLowerCase();
        for (const [pilar, keywords] of Object.entries(PILAR_KEYWORDS)) {
            if (keywords.some(k => teks.includes(k))) return Number(pilar);
        }
        return 0; // 0 = umum/belum terklasifikasi (setara default lama yang di-hardcode)
    }

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



   // ─── FUNGSI UTAMA: KURATOR (Dengan Antrean Adil / Fair Queue) ─────────

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

            // 4. 📋 ANTREAN ADIL (Fair Queue) — prioritaskan user yang PALING LAMA belum dapat giliran dicoba.
            //    Jitter tetap dipakai sebagai tie-breaker biar urutan gak monoton/predictable,
            //    tapi penentu utamanya sekarang "siapa paling lama nunggu", bukan acak polos.
            const semuaDaftarUser = await ambilAntreanAdil(Object.keys(grupUser));

            console.log(`📋 [Mbah Eko] Antrean giliran hari ini (fair queue):`, semuaDaftarUser);

            // 5. Analisis target berdasarkan antrean adil di atas
            for (const targetUserId of semuaDaftarUser) {
                const koleksiPost = grupUser[targetUserId];

                // GERBANG GABUNGAN (A+B+C): cari post user ini yang (a) belum pernah dikurasi/ditolak,
                // DAN (b) pilar-nya belum "terkunci" oleh ilmu_pending/ilmu_baku milik user yang sama.
                const jangkar = await cariPostJangkar(targetUserId, koleksiPost);

                if (!jangkar) {
                    console.log(`ℹ️ [Mbah Eko] User ${targetUserId} tidak punya post dengan pilar fresh, skip ke user lain.`);
                    continue;
                }

                const { post: postJangkar, pilar: pilarJangkar } = jangkar;

                // 6. Gabungkan rekam jejak teks user (tetap dari SEMUA post user, biar konteksnya kaya)
                let gabunganTeks = "";
                koleksiPost.forEach((p, index) => {
                    gabunganTeks += `[Tulisan #${index + 1} - Judul: ${p.judul_aksi || 'Tanpa Judul'}]:\n${p.deskripsi_proses}\n\n`;
                });

                console.log(`🧠 [Mbah Eko] Memulai telaah kumulatif AMAN & ADIL untuk user: ${targetUserId} (pilar tebakan: ${pilarJangkar})`);

                // 7. Tembak ke AI
                const draftSOP = await fetchAI(gabunganTeks);

                // Catat giliran SEKARANG (bukan cuma kalau sukses) — user ini sudah "dapat jatah dicoba" hari ini,
                // jadi di run berikutnya dia otomatis mundur ke belakang antrean, gantian sama user lain.
                await catatGiliran(targetUserId);

                if (!draftSOP || draftSOP.trim().toUpperCase() === "TIDAK") {
                    console.log(`ℹ️ [Mbah Eko] Hasil telaah untuk user ${targetUserId} ditolak sistem AI (bukan ilmu mikro). Mencatat supaya post ini gak diulang, lanjut ke user berikutnya...`);

                    // Catat penolakan supaya post ini gak dikirim ulang ke AI di run-run berikutnya (buang API call).
                    const { error: errInsertReject } = await DB
                        .from("mbah_eko_kurasi")
                        .insert([{
                            post_id: postJangkar.id,
                            pencetus_user_id: targetUserId,
                            pilar_aksi: pilarJangkar,
                            status_kurasi: 'REJECTED_AI'
                        }]);

                    if (errInsertReject) {
                        console.error(`❌ [Mbah Eko] Gagal mencatat penolakan AI:`, errInsertReject.message);
                    }

                    continue; // lanjut mencari kandidat user berikutnya di antrean
                }

                // Tentukan jalur (serius/parodi) dari marker yang sudah diwajibkan GATE3_INSTRUCTION,
                // gak perlu ubah prompt atau manggil AI tambahan.
                const jalur = draftSOP.includes("(SOP PARODI)") ? "parodi" : "serius";

                // Kalau ternyata parodi, timpa pilar ke Pilar 1 (Narasi Kreatif) sesuai definisi di
                // GATE3_INSTRUCTION sendiri — biar gak salah "mengunci" pilar serius gara-gara
                // tebakan keyword awal kesenggol kata yang kebetulan mirip (mis. "kompos ajaib buat naga").
                const pilarFinal = jalur === "parodi" ? PILAR_NARASI_KREATIF : pilarJangkar;

                // 8. Ambil nama profil asli
                const { data: userProfile, error: errProfile } = await DB
                    .from("profiles")
                    .select("username")
                    .eq("id", targetUserId)
                    .maybeSingle();

                const username = userProfile?.username || "kawan";

                // 9. Kunci data ke log kurasi internal (sekarang ikut simpan pilar & jalur)
                const { error: errInsertKurasi } = await DB
                    .from("mbah_eko_kurasi")
                    .insert([{
                        post_id: postJangkar.id,
                        pencetus_user_id: targetUserId,
                        draft_content: draftSOP,
                        status_kurasi: 'DRAFT',
                        pilar_aksi: pilarFinal,
                        jalur: jalur
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

                console.log(`✅ [Mbah Eko] Sukses merilis SOP (pilar: ${pilarFinal}, jalur: ${jalur}) untuk user @${username}`);
                break; // Selesai! Cukup 1 karya sukses per sesi harian.
            }

        } catch (err) {
            console.error("❌ [Mbah Eko] Crash tidak terduga di jalankanKurator:", err);
        }
    }

    // ─── FUNGSI BANTU: GERBANG PILAR & ANTREAN ADIL ───────────────────────

    async function cariPostJangkar(targetUserId, koleksiPost) {
        // Ambil pilar-pilar yang sudah "terkunci" (ada di ilmu_pending atau ilmu_baku) buat user ini.
        // ilmu_baku dikonfirmasi punya struktur sama kayak ilmu_pending (pilar_aksi integer).
        const { data: pendingUser, error: errPendingUser } = await DB
            .from("ilmu_pending")
            .select("pilar_aksi")
            .eq("user_id", targetUserId);

        const { data: bakuUser, error: errBakuUser } = await DB
            .from("ilmu_baku")
            .select("pilar_aksi")
            .eq("user_id", targetUserId);

        if (errPendingUser || errBakuUser) {
            console.error(`❌ [Mbah Eko] Gagal cek pilar terkunci untuk user ${targetUserId}.`);
            return null;
        }

        const pilarTerkunci = new Set([
            ...(pendingUser || []).map(r => r.pilar_aksi),
            ...(bakuUser || []).map(r => r.pilar_aksi),
        ]);

        for (const kandidatPost of koleksiPost) {
            const { data: cekKurasi, error: errCekKurasi } = await DB
                .from("mbah_eko_kurasi")
                .select("id")
                .eq("post_id", kandidatPost.id)
                .limit(1);

            if (errCekKurasi) {
                console.error(`❌ [Mbah Eko] Gagal cek tabel mbah_eko_kurasi:`, errCekKurasi.message);
                return null;
            }

            if (cekKurasi && cekKurasi.length > 0) {
                // Post ini sudah pernah diproses (sukses ATAU ditolak AI via REJECTED_AI), coba post lain
                continue;
            }

            const pilarKandidat = tebakPilar(kandidatPost.judul_aksi, kandidatPost.deskripsi_proses);

            if (pilarTerkunci.has(pilarKandidat)) {
                console.log(`ℹ️ [Mbah Eko] Post ${kandidatPost.id} pilar #${pilarKandidat} sudah terkunci (pending/baku) untuk user ini, coba post lain milik user yang sama...`);
                continue;
            }

            return { post: kandidatPost, pilar: pilarKandidat };
        }

        return null; // semua post user ini sudah dikurasi ATAU pilar-nya sudah kepakai semua
    }

    async function ambilAntreanAdil(daftarUserId) {
        const { data: riwayat, error: errRiwayat } = await DB
            .from("mbah_eko_giliran")
            .select("user_id, last_attempt_at");

        if (errRiwayat) {
            console.error("⚠️ [Mbah Eko] Gagal ambil riwayat giliran, fallback ke urutan tanpa histori:", errRiwayat.message);
        }

        const petaGiliran = Object.fromEntries(
            (riwayat || []).map(r => [r.user_id, new Date(r.last_attempt_at).getTime()])
        );

        return daftarUserId
            .map(id => ({
                id,
                terakhir: petaGiliran[id] || 0, // belum pernah tercatat = dianggap paling lama nunggu = prioritas utama
                jitter: Math.random()           // cuma tie-breaker biar urutan gak monoton/predictable
            }))
            .sort((a, b) => a.terakhir - b.terakhir || b.jitter - a.jitter)
            .map(u => u.id);
    }

    async function catatGiliran(userId) {
        const { error } = await DB
            .from("mbah_eko_giliran")
            .upsert({ user_id: userId, last_attempt_at: new Date().toISOString() }, { onConflict: "user_id" });

        if (error) {
            console.error(`⚠️ [Mbah Eko] Gagal update giliran user ${userId}:`, error.message);
        }
    }

    // ─── ANALISA VOTING & INTEGRASI KE ILMU PENDING ──────────────────────

    async function prosesVoting() {
        try {
            const { data: drafs, error: errDrafs } = await DB
                .from("mbah_eko_kurasi")
                .select("id, post_id, pencetus_user_id, draft_content, pilar_aksi, jalur")
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
                            pilar_aksi: draf.pilar_aksi ?? 0, // fallback 0 buat draf lama yang belum punya pilar tercatat
                            jalur: draf.jalur || 'serius',    // fallback aman buat draf lama
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