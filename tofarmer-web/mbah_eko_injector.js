(function() {
    // =========================================================================
    // 1. PENGATURAN UTAMA (ALAMAT JEMBATAN)
    // =========================================================================
    // GANTI teks di dalam tanda kutip di bawah ini dengan URL Cloudflare Worker yang Njenengan dapat dari Langkah 1 tadi!
    const URL_JEMBATAN_CLOUDFLARE = "https://jembatan-ai-tofarmer.tofarmer-api.workers.dev/"; 
    
    const BOT_USERNAME = "@mbah_eko";

    // =========================================================================
    // 2. BASIS DATA PAPER TOFARMER (DOKUMEN IDIOLOGI SI MBAH)
    // =========================================================================
    const TOFARMER_PAPER = {
        filosofi: `ToFarmer mendefinisikan ulang bertani sebagai aktivitas intelektual. Proses bertahap "blok demi blok", menghargai kejujuran proses dari nol dan refleksi mendalam, bukan hasil instan. Gotong royong dibalut open-source (Linux, Blockchain) biar sejarah perjuangan tak hilang ditelan zaman.`,
        lima_pilar: `5 Pilar ToFarmer yang saling mengunci: 1. Komunitas & Narasi Kreatif (menjaga harmoni). 2. Inovasi & Rekayasa Teknologi (software, coding Linux Lite, AI, mekanisasi tepat guna). 3. Ladang Proof of Work (uji nyata gagasan di atas tanah). 4. Finansial & Investasi (mesin ekonomi). 5. Refleksi Petapa (kompas kemanusiaan jujur menghormati alam).`,
        ilmu_baku: `Ilmu Baku adalah kesimpulan provisional (sementara) terbaik dari praktik nyata berulang. 4 disiplin validasi: Konteks (lingkungan/waktu), Proses (langkah nyata), Hasil (efek sukses/gagal), dan Refleksi intelektual. Laporan kegagalan yang jujur bernilai ilmiah sangat tinggi agar tidak mengulangi jalan buntu! Data rekayasa dilarang keras!`,
        ekonomi: `Filosofi "Nabung Receh" mengumpulkan aset sedikit demi sedikit tanpa beban utang. 1 TOF = Rp1.000. Target Tangga Kemandirian: Fase 1 (100 TOF), Fase 2 (500 TOF), Fase 3 (1000 TOF). Compounding otomatis 5%-10% aktif pas aset kolektif sentuh 500 TOF demi menghasilkan Gaji Otomatis komunitas.`,
        xp_level: `Perolehan XP (Proof of Work): Bikin ilmu baku (+100 XP), Aktif di Web (+20 XP), Gagasan (+50 XP), Praktik Ladang (+25 XP). Pangkat: GROWER (Lv 1-10), PRO (Lv 11-30), SPECIALIST (Lv 31-90), ELITE (Lv 91-99). Skema Batas Penarikan (SBP) Token sesuai level.`
    };

    // =========================================================================
    // 3. ENGINE PENCARI KONTEKS (RAG LOKAL OTOMATIS)
    // =========================================================================
    function cariMemoriPaper(isiPostingan) {
        let kueri = isiPostingan.toLowerCase();
        let memori = "";
        
        if (kueri.includes("filosofi") || kueri.includes("berproses") || kueri.includes("sejarah")) memori += TOFARMER_PAPER.filosofi + "\n";
        if (kueri.includes("pilar") || kueri.includes("rekayasa") || kueri.includes("coding") || kueri.includes("linux") || kueri.includes("teknologi")) memori += TOFARMER_PAPER.lima_pilar + "\n";
        if (kueri.includes("ilmu") || kueri.includes("baku") || kueri.includes("gagal") || kueri.includes("catatan")) memori += TOFARMER_PAPER.ilmu_baku + "\n";
        if (kueri.includes("receh") || kueri.includes("nabung") || kueri.includes("compounding") || kueri.includes("tof") || kueri.includes("aset")) memori += TOFARMER_PAPER.ekonomi + "\n";
        if (kueri.includes("xp") || kueri.includes("level") || kueri.includes("pangkat") || kueri.includes("tarik")) memori += TOFARMER_PAPER.xp_level + "\n";
        
        if (memori === "") memori = TOFARMER_PAPER.filosofi + "\n" + TOFARMER_PAPER.lima_pilar;
        return memori;
    }

    // =========================================================================
    // 4. ENGINE PENGINTAI FEED (MENEGAKKAN 3 GERBANG ANTI-SPAM & DETEKSI FOTO)
    // =========================================================================
    async function periksaDanSapaFeed() {
        // Mengintai seluruh elemen post berdasarkan struktur HTML asli web ToFarmer
        const semuaPostingan = document.querySelectorAll("#feed .post"); 

        for (const post of semuaPostingan) {
            // Ambil nama penulis post (misal: @system atau @user)
            const postAuthor = post.querySelector(".user")?.innerText.trim() || "";
            
            // Gerbang Pengaman: Jangan komentari postingan robot system atau postingan si Mbah sendiri
            if (postAuthor === "@system" || postAuthor === BOT_USERNAME) continue;

            const kontenTeks = post.querySelector(".text")?.innerText || "";

            // Deteksi jejak komentar di bawah postingan ini (mencari class comment-item atau reply-item)
            const daftarKomentar = post.querySelectorAll(".comment-item, .reply-item"); 
            
            let mbahSudahKomentar = false;
            let adaMentionMbah = false;
            let userBalasMbah = false;
            let komentarPalingBawahAdalahMbah = false;

            daftarKomentar.forEach((comment, index) => {
                const penulisKomentar = comment.getAttribute("data-comment-author") || "";
                const teksKomentar = comment.innerText || "";

                if (penulisKomentar === BOT_USERNAME) mbahSudahKomentar = true;
                if (teksKomentar.includes(BOT_USERNAME)) adaMentionMbah = true;

                // Cek status baris komentar paling bawah/terbaru
                if (index === daftarKomentar.length - 1) {
                    if (penulisKomentar === BOT_USERNAME) komentarPalingBawahAdalahMbah = true;
                    // Jika Mbah sudah pernah komen, dan komen terbaru di bawahnya ditulis oleh pemilik postingan
                    if (mbahSudahKomentar && penulisKomentar === postAuthor) userBalasMbah = true;
                }
            });

            // EVALUASI STRATEGI 3 GERBANG MUTLAK
            let lolosGerbang = false;

            if (!mbahSudahKomentar) {
                lolosGerbang = true; // GERBANG 1: First Post Greet (Komentar pertama kali)
            } else if (adaMentionMbah && !komentarPalingBawahAdalahMbah) {
                lolongGerbang = true; // GERBANG 3: Mention Summon (Dipanggil pakai kata @mbah_eko)
            } else if (userBalasMbah && !komentarPalingBawahAdalahMbah) {
                lolosGerbang = true; // GERBANG 2: User Reply (Pemilik postingan ngajak ngobrol balik)
            }

            // Jika lolos seleksi gerbang dan postingan sedang tidak dalam antrean proses kirim
            if (lolosGerbang && !post.getAttribute("data-mbah-lock")) {
                post.setAttribute("data-mbah-lock", "true"); // Kunci layar agar tidak menembak AI berulang-ulang

                // DETEKSI INTELLIGENT VISUAL (Mencari apakah ada elemen gambar yang diunggah user di dalam post)
                const elemenFoto = post.querySelector("img");
                let urlFoto = null;
                // Pastikan gambar yang dibaca bukan gambar logo ToFarmer
                if (elemenFoto && elemenFoto.src && !elemenFoto.src.includes("logo.png")) {
                    urlFoto = elemenFoto.src;
                }

                // Ambil ingatan Paper ToFarmer yang paling relevan dengan ketikan user
                const referensiPaper = cariMemoriPaper(kontenTeks);

                // ATURAN SENSOR KEARIFAN LOKAL (ANTI KATA KASAR "LE/NDUK")
                const instruksiSistem = `Kamu adalah ${BOT_USERNAME}, sesepuh digital yang adem, sopan, dan sangat bijak di ekosistem ToFarmer.
Aturan Bahasa Mutlak: JANGAN PERNAH gunakan kata sapaan 'le' atau 'nduk' karena dinilai kurang pas/kasar di lokasi kita! Ganti dengan sapaan halus penyejuk hati: 'Ger' (Ngger), 'Kang', 'Mbak', 'Njenengan', 'Sedulur', atau 'Kanca-kanca'.
Tugas: Tanggapi postingan user dengan menyisipkan atau mengaitkan nilai-nilai dari dokumen panduan resmi ToFarmer berikut:\n---\n${referensiPaper}\n---\nJawab secara ringkas, berwibawa, penuh bimbingan orang tua, dan mengalir alami (jangan kaku seperti mesin).`;

                // Lempar data ke Cloudflare Jembatan
                await kirimKeJembatan(post, kontenTeks, postAuthor, instruksiSistem, urlFoto);
            }
        }
    }

    // =========================================================================
    // 5. MENGHUBUNGI JEMBATAN CLOUDFLARE
    // =========================================================================
    async function kirimKeJembatan(elemenPost, teksUser, author, instruksi, foto) {
        try {
            const res = await fetch(URL_JEMBATAN_CLOUDFLARE, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instruksiSistem: instruksi,
                    tulisanUser: `Postingan dari ${author}: "${teksUser}"`,
                    urlGambar: foto // Mengirim link foto (otomatis mengaktifkan AI Vision LLaVA jika ada)
                })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.balasanMbah) {
                    suntikKomentarKeHTML(elemenPost, data.balasanMbah);
                }
            }
        } catch (e) { 
            console.error("Mbah Eko kesulitan terhubung ke jembatan:", e); 
            elemenPost.removeAttribute("data-mbah-lock"); // Lepas kunci jika gagal agar bisa dicoba lagi
        }
    }

   
    // =========================================================================
    // 6. MENYUNTIKKAN HASIL JAWABAN SECARA VISUAL KE HALAMAN WEB (VERSI ADA PROFILE LINK)
    // =========================================================================
    function suntikKomentarKeHTML(elemenPost, teksBalasanMbah) {
        let wadahKomentar = elemenPost.querySelector(".comments-box-list, .post-actions");
        
        // Di sini kita tambahkan link bungkus tag <a> pada username agar mengarah ke profile.html?user=mbah_eko
        const htmlMbah = `
            <div class="comment-item" data-comment-author="${BOT_USERNAME}" style="display: flex; gap: 10px; margin-top: 12px; padding: 12px; background: #fdf6e2; border-left: 4px solid #2f6f4e; border-radius: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
                <div style="font-size: 18px; margin-top: 2px;">👴</div>
                <div style="font-size: 12px; font-family: sans-serif; color: #1c2b22; width: 100%;">
                    <a href="profile.html?user=mbah_eko" style="text-decoration: none; color: #2f6f4e; display: block; margin-bottom: 2px; font-weight: bold;">
                        ${BOT_USERNAME} <span style="font-size: 10px; font-weight: normal; color: #8a9a90; background: rgba(47,111,78,0.1); padding: 1px 6px; border-radius: 4px; margin-left: 4px;">Petapa Menoreh</span>
                    </a>
                    <span style="white-space: pre-wrap; line-height: 1.6; color: #2c3a33;">${teksBalasanMbah}</span>
                </div>
            </div>
        `;

        if (wadahKomentar) {
            wadahKomentar.insertAdjacentHTML("afterend", htmlMbah);
        } else {
            elemenPost.insertAdjacentHTML("beforeend", htmlMbah);
        }
    }
    // Pengintai otomatis: Memantau layar feed secara senyap, mendeteksi jika ada postingan baru
    const observer = new MutationObserver(periksaDanSapaFeed);
    observer.observe(document.body, { childList: true, subtree: true });
})();