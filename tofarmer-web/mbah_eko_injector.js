(function() {
    const URL_JEMBATAN_CLOUDFLARE = "https://jembatan-ai-tofarmer.tofarmer-api.workers.dev/"; 
    const BOT_USERNAME = "@mbah_eko";

    const TOFARMER_PAPER = {
        filosofi: `ToFarmer mendefinisikan ulang bertani sebagai aktivitas intelektual. Proses bertahap "blok demi blok", menghargai kejujuran proses dari nol dan refleksi mendalam, bukan hasil instan. Gotong royong dibalut open-source (Linux, Blockchain) biar sejarah perjuangan tak hilang ditelan zaman.`,
        lima_pilar: `5 Pilar ToFarmer yang saling mengunci: 1. Komunitas & Narasi Kreatif (menjaga harmoni). 2. Inovasi & Rekayasa Teknologi (software, coding Linux Lite, AI, mekanisasi tepat guna). 3. Ladang Proof of Work (uji nyata gagasan di atas tanah). 4. Finansial & Investasi (mesin ekonomi). 5. Refleksi Petapa (kompas kemanusiaan jujur menghormati alam).`,
        ilmu_baku: `Ilmu Baku adalah kesimpulan provisional (sementara) terbaik dari praktik nyata berulang. 4 disiplin validasi: Konteks (lingkungan/waktu), Proses (langkah nyata), Hasil (efek sukses/gagal), dan Refleksi intelektual. Laporan kegagalan yang jujur bernilai ilmiah sangat tinggi agar tidak mengulangi jalan buntu! Data rekayasa dilarang keras!`,
        ekonomi: `Filosofi "Nabung Receh" mengumpulkan aset sedikit demi sedikit tanpa beban utang. 1 TOF = Rp1.000. Target Tangga Kemandirian: Fase 1 (100 TOF), Fase 2 (500 TOF), Fase 3 (1000 TOF). Compounding otomatis 5%-10% aktif pas aset kolektif sentuh 500 TOF demi menghasilkan Gaji Otomatis komunitas.`,
        xp_level: `Perolehan XP (Proof of Work): Bikin ilmu baku (+100 XP), Aktif di Web (+20 XP), Gagasan (+50 XP), Praktik Ladang (+25 XP). Pangkat: GROWER (Lv 1-10), PRO (Lv 11-30), SPECIALIST (Lv 31-90), ELITE (Lv 91-99). Skema Batas Penarikan (SBP) Token sesuai level.`
    };

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

    let kebalGoncangan = false;

    async function periksaDanSapaFeed() {
        if (kebalGoncangan) return; 

        // 1. Ambil semua postingan utama di feed
        const semuaPostingan = document.querySelectorAll("#feed .post"); 
        if (!semuaPostingan.length) return;

        for (const post of semuaPostingan) {
            if (post.getAttribute("data-mbah-lock") === "true") continue;

            const postAuthor = post.querySelector(".user")?.innerText.trim() || "";
            if (postAuthor === "@system" || postAuthor === BOT_USERNAME || postAuthor === "") continue;

            const kontenTeksUtama = post.querySelector(".text")?.innerText || "";
            
            // 2. Ambil seluruh elemen teks di area komentar (termasuk buatan comments.js)
            // Kita kumpulkan semua elemen teks di dalam post tersebut agar tidak ada yang lolos
            const seluruhBalonTeks = post.querySelectorAll("p, span, div");
            
            let adaMentionMbahDiKomentar = false;
            let teksKomentarMention = "";
            let mbahSudahPernahKomentar = false;

            seluruhBalonTeks.forEach((elemen) => {
                const teksMentah = elemen.innerText || "";
                
                // Cek apakah ini komentar asli buatan si Mbah sendiri
                if (teksMentah.includes("Petapa Menoreh") || elemen.getAttribute("data-comment-author") === BOT_USERNAME) {
                    mbahSudahPernahKomentar = true;
                }

                // EFEK MAGIS: Jika ada teks @mbah_eko atau @username lain yang masih berupa teks mati,
                // kita bungkus otomatis menjadi tautan profil aktif yang bisa diklik!
                if (teksMentah.includes("@") && !elemen.querySelector("a")) {
                    const htmlAsli = elemen.innerHTML;
                    // Ubah teks @username menjadi link dinamis
                    const htmlBaru = htmlAsli.replace(/@([a-zA-Z0-9_]+)/g, function(match, username) {
                        return `<a href="profile.html?user=${username}" style="color: #2f6f4e; font-weight: 600; text-decoration: none; border-bottom: 1px dashed #2f6f4e;">@${username}</a>`;
                    });
                    if (htmlAsli !== htmlBaru) {
                        elemen.innerHTML = htmlBaru;
                    }
                }

                // Catat jika ada mention spesifik ke @mbah_eko di kolom komentar
                if (teksMentah.includes(BOT_USERNAME) && !teksMentah.includes("Petapa Menoreh") && elemen.getAttribute("data-comment-author") !== BOT_USERNAME) {
                    adaMentionMbahDiKomentar = true;
                    teksKomentarMention = teksMentah;
                }
            });

            // 3. LOGIKA GERBANG KEDATANGAN AI MBAH EKO
            let lolosGerbang = false;
            let bahanTulisanAI = kontenTeksUtama;

            if (!mbahSudahPernahKomentar) {
                // Sapaan pertama kali pada postingan baru
                lolosGerbang = true;
            } else if (adaMentionMbahDiKomentar) {
                // Sapaan karena dipanggil di kolom komentar
                const hashMention = btoa(teksKomentarMention).substring(0, 10);
                if (post.getAttribute("data-mbah-mention-read") !== hashMention) {
                    lolosGerbang = true;
                    bahanTulisanAI = `[PENGGUNA MEMENTION KAMU DI KOMENTAR: "${teksKomentarMention}"]\n\nIsi postingan utama mereka: ${kontenTeksUtama}`;
                    post.setAttribute("data-mbah-mention-read", hashMention);
                }
            }

            if (lolosGerbang) {
                post.setAttribute("data-mbah-lock", "true"); 
                kebalGoncangan = true;

                const elemenFoto = post.querySelector("img");
                let urlFoto = null;
                if (elemenFoto && elemenFoto.src && !elemenFoto.src.includes("logo") && !elemenFoto.src.includes("avatar")) {
                    urlFoto = elemenFoto.src;
                }

                const referensiPaper = cariMemoriPaper(kontenTeksUtama + " " + teksKomentarMention);
                const ComicSistem = `Kamu adalah ${BOT_USERNAME}, sesepuh digital yang adem, sopan, dan sangat bijak di ekosistem ToFarmer. Aturan Bahasa Mutlak: JANGAN PERNAH gunakan kata sapaan 'le' atau 'nduk'! Ganti dengan sapaan halus penyejuk hati: 'Ger' (Ngger), 'Kang', 'Mbak', 'Njenengan', atau 'Sedulur'. Tanggapi postingan/komentar user dengan menyisipkan nilai resmi ToFarmer berikut:\n---\n${referensiPaper}\n---\nJawab ringkas, padat, penuh petuah tua, dan mengalir alami.`;

                await kirimKeJembatan(post, bahanTulisanAI, postAuthor, ComicSistem, urlFoto);
                
                post.removeAttribute("data-mbah-lock");
                setTimeout(() => { kebalGoncangan = false; }, 2500);
            }
        }
    }

    async function kirimKeJembatan(elemenPost, teksUser, author, instruksi, foto) {
        try {
            const res = await fetch(URL_JEMBATAN_CLOUDFLARE, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instruksiSistem: instruksi,
                    tulisanUser: `Postingan dari ${author}: "${teksUser}"`,
                    urlGambar: foto
                })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.balasanMbah) {
                    suntikKomentarKeHTML(elemenPost, data.balasanMbah);
                }
            } else {
                console.warn("Jembatan Cloudflare merespon dengan status:", res.status);
            }
        } catch (e) { 
            console.error("Mbah Eko gagal mendayung melewati jembatan:", e); 
        }
    }

    function suntikKomentarKeHTML(elemenPost, teksBalasanMbah) {
        let wadahKomentar = elemenPost.querySelector(".comments-box-list, .post-actions, .comments-section");
        
        const htmlMbah = `
            <div class="comment-item" data-comment-author="${BOT_USERNAME}" style="display: flex; gap: 10px; margin-top: 12px; padding: 12px; background: #fdf6e2; border-left: 4px solid #2f6f4e; border-radius: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.02); text-align: left;">
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

    // Hanya intip area kontainer feed utama saja agar tidak terganggu oleh rombakan info finansial/avatar
    const targetFeed = document.getElementById("feed") || document.body;
    const observer = new MutationObserver(periksaDanSapaFeed);
    observer.observe(targetFeed, { childList: true, subtree: true });
})();