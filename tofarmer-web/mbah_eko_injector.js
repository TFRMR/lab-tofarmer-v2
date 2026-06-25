(function () {
    console.log("👴 [Mbah Eko] Kurator Ilmu Mikro Aktif (Mode Analisis Per User & Autocomplete)...");

    const BOT_USER_ID = "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY";
    const DB = window.supabaseClient;

    // Daftar user_id yang tidak boleh dikurasi (akun bot / sistem)
    const BLACKLIST_USER_IDS = [
        BOT_USER_ID,                                                              // Mbah Eko sendiri
        "HVYBLWO7XBPO76SP7KBBYZ5ZVTCPWA5Z4RTVCYBH4IBL3GJFV5DBZTWNMI"           // TOPLES_ECOSYSTEM (bot akuntansi)
    ];

    const GATE3_INSTRUCTION = `INSTRUKSI TUGAS: Anda adalah ahli kurasi ilmu mikro petani senior. 
    Tugas Anda adalah menganalisis KUMPULAN catatan/postingan dari SATU USER tertentu untuk ditarik kesimpulan besarnya menjadi sebuah SOP Baku.
    
    ⚠️ PERINGATAN GAYA BAHASA: WAJIB pertahankan gaya bahasa asli, istilah lokal, kosakata unik, dan karakter mengetik dominan dari data asli. Rapikan hanya typo yang parah.
    
    ⚠️ ATURAN KELENGKAPAN DATA: Jika di dalam tulisan user terdapat langkah atau parameter yang kurang spesifik (misal: tidak menyebut durasi waktu, takaran pasti, atau suhu), Anda WAJIB melengkapinya secara mandiri menggunakan pemahaman umum agrikultur atau standar rekomendasi teknis yang paling aman dan logis.
    
    Tugas Anda:
    1. Filter KETAT — jawab hanya dengan kata TIDAK jika kumpulan data ini sama sekali tidak mengandung panduan teknis agrikultur (pertanian, peternakan, perikanan, pupuk, hama, dll).
    2. Jika lolos kedua filter di atas, gabungkan pemikiran-pemikiran user tersebut menjadi satu SOP Baku terintegrasi dengan format:
       - JUDUL: [Nama SOP asli/relevan dengan keahlian user]
       - KONSEP DASAR: [Penjelasan inti dari gabungan ide tulisan mereka]
       - PERSIAPAN: [Alat/Bahan yang disebut, lengkapi takaran standarnya jika user tidak menulisnya]
       - SOP TEKNIS: [Urutan langkah kumulatif yang logis & lengkap]
       - PARAMETER KEBERHASILAN: [Indikator keberhasilan yang jelas/terukur]
       - MITIGASI RISIKO: [Hal-hal yang harus diwaspadai berdasarkan catatan atau risiko umum dari praktik tersebut]`;

    const VOTING_INSTRUCTION = `Anda adalah analis sentimen komunitas petani.
    Baca kumpulan komentar berikut dan tentukan apakah komunitas SETUJU atau TIDAK SETUJU bahwa konten ini adalah ilmu bermanfaat.
    Komentar yang menunjukkan SETUJU: kata seperti "bagus", "bermanfaat", "mantap", "setuju", "cocok", "benar", "oke", "yes", "👍", dll.
    Komentar yang menunjukkan TIDAK SETUJU: kata seperti "tidak", "salah", "kurang", "jelek", "nggak", "beda", "keliru", "👎", dll.
    Jawab HANYA dengan JSON valid tanpa teks lain, tanpa markdown, tanpa penjelasan apapun.
    Format wajib: {"ya": NUMBER, "tidak": NUMBER}`;

    // ─── FUNGSI UTAMA: KURATOR (Detection & Drafting - User Based) ────────

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

            // 2. Ambil pool postingan terbaru yang lebih besar untuk dikelompokkan per user
            const { data: posts, error: errPosts } = await DB
                .from("contributions")
                .select("id, deskripsi_proses, user_id, judul_aksi")
                .or("deskripsi_proses.ilike.%cara %,deskripsi_proses.ilike.%bikin %,deskripsi_proses.ilike.%trik %,deskripsi_proses.ilike.%langkah %,deskripsi_proses.ilike.%tutorial %")
                .order("created_at", { ascending: false })
                .limit(20);

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
                
                if (!grupUser[post.user_id]) {
                    grupUser[post.user_id] = [];
                }
                grupUser[post.user_id].push(post);
            }

            // 4. Analisis target rekam jejak user per user
            for (const targetUserId in grupUser) {
                const koleksiPost = grupUser[targetUserId];
                
                // Gunakan postingan terbaru user ini sebagai jangkar (anchor) referensi database
                const postJangkar = koleksiPost[0];

                // Cek apakah post jangkar sudah pernah diproses agar tidak duplikat
                const { data: cekProses, error: errCek } = await DB
                    .from("mbah_eko_kurasi")
                    .select("id")
                    .eq("post_id", postJangkar.id)
                    .maybeSingle();

                if (errCek) {
                    console.error(`❌ [Mbah Eko] Gagal cek duplikat post ${postJangkar.id}:`, errCek.message);
                    continue;
                }

                if (cekProses) {
                    console.log(`ℹ️ [Mbah Eko] Rekam jejak user ${targetUserId} pada post ${postJangkar.id} sudah diproses, skip.`);
                    continue;
                }

                // 5. Gabungkan isi deskripsi proses dari seluruh tulisan user ini ke dalam satu payload
                let gabunganTeks = "";
                koleksiPost.forEach((p, index) => {
                    gabunganTeks += `[Tulisan #${index + 1} - Judul: ${p.judul_aksi || 'Tanpa Judul'}]:\n${p.deskripsi_proses}\n\n`;
                });

                console.log(`🧠 [Mbah Eko] Menganalisis ${koleksiPost.length} catatan kumulatif dari user: ${targetUserId}`);

                // 6. AI Validasi, Drafting, dan Autocomplete Parameter Umum
                const draftSOP = await fetchAI(gabunganTeks);

                // Abaikan jika kesimpulan gabungan bukan ilmu mikro agrikultur
                if (!draftSOP || draftSOP.trim().toUpperCase() === "TIDAK") {
                    console.log(`ℹ️ [Mbah Eko] Hasil telaah user ${targetUserId} bukan ilmu mikro, dilewati.`);
                    continue;
                }

                // 7. Ambil username untuk keperluan narasi feed
                const { data: userProfile, error: errProfile } = await DB
                    .from("profiles")
                    .select("username")
                    .eq("id", targetUserId)
                    .maybeSingle();

                if (errProfile) {
                    console.error(`❌ [Mbah Eko] Gagal ambil profil user ${targetUserId}:`, errProfile.message);
                }

                const username = userProfile?.username || "kawan";

                // 8. Simpan ke database kurasi menggunakan data jangkar
                const { error: errKurasi } = await DB
                    .from("mbah_eko_kurasi")
                    .insert([{
                        post_id: postJangkar.id,
                        pencetus_user_id: targetUserId,
                        draft_content: draftSOP,
                        status_kurasi: 'DRAFT'
                    }]);

                if (errKurasi) {
                    console.error(`❌ [Mbah Eko] Gagal simpan kurasi ke DB:`, errKurasi.message);
                    continue;
                }

                // 9. Posting hasil kesimpulan besar ke Feed (Tabel contributions)
                const kontenFinal = `Setelah mengamati beberapa catatan penting dari @${username}, saya kumpulkan intisari ilmu berjalannya menjadi satu SOP terintegrasi. Matur nuwun konsistensinya, mari kita bedah bersama:\n\n${draftSOP}`;

                const { error: errPost } = await DB
                    .from("contributions")
                    .insert([{
                        user_id: BOT_USER_ID,
                        judul_aksi: `Hasil Telaah Ilmu: @${username}`,
                        deskripsi_proses: kontenFinal
                    }]);

                if (errPost) {
                    console.error("❌ [Mbah Eko] Gagal posting hasil telaah ke feed:", errPost.message);
                    continue;
                }

                console.log(`✅ [Mbah Eko] Berhasil menerbitkan hasil analisa mendalam untuk user @${username}`);
                break; // Hanya memproses 1 kesimpulan besar per hari agar tidak spamming
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