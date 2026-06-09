(function() {
    console.log("👴 [Mbah Eko] Skrip injector resmi aktif & mulai mengintai...");

    const URL_JEMBATAN_CLOUDFLARE = "https://jembatan-ai-tofarmer.tofarmer-api.workers.dev/"; 
    const BOT_USERNAME = "@mbah_eko";

    const TOFARMER_PAPER = {
        filosofi: `ToFarmer mendefinisikan ulang bertani sebagai aktivitas intelektual. Proses bertahap "blok demi blok", menghargai kejujuran proses dari nol dan refleksi mendalam, bukan hasil instan.`,
        lima_pilar: `5 Pilar ToFarmer yang saling mengunci.`,
        ilmu_baku: `Ilmu Baku adalah kesimpulan provisional (sementara) terbaik dari praktik nyata berulang.`,
        ekonomi: `Filosofi "Nabung Receh" mengumpulkan aset sedikit demi sedikit tanpa beban utang.`,
        xp_level: `Perolehan XP (Proof of Work).`
    };

    function cariMemoriPaper(isiPostingan) {
        let kueri = isiPostingan.toLowerCase();
        let memori = "";
        if (kueri.includes("filosofi")) memori += TOFARMER_PAPER.filosofi + "\n";
        if (kueri.includes("pilar")) memori += TOFARMER_PAPER.lima_pilar + "\n";
        if (kueri.includes("baku")) memori += TOFARMER_PAPER.ilmu_baku + "\n";
        if (kueri.includes("receh")) memori += TOFARMER_PAPER.ekonomi + "\n";
        if (memori === "") memori = TOFARMER_PAPER.filosofi;
        return memori;
    }

    let sedangMemprosesKomentar = false;

    async function periksaDanSapaFeed() {
        if (sedangMemprosesKomentar) return;

        // 👀 INDIKATOR 1: Apakah kontainer #feed ditemukan?
        const semuaPostingan = document.querySelectorAll("#feed .post"); 
        if (!semuaPostingan.length) {
            // Jika kosongan, kita cari alternatif selektor .post umum
            const postsAlternatif = document.querySelectorAll(".post");
            if(postsAlternatif.length > 0) {
                console.log(`👴 [Mbah Eko] Menemukan ${postsAlternatif.length} postingan dengan selektor alternatif .post (Tanpa #feed)`);
            }
            return;
        }

        for (const post of semuaPostingan) {
            if (post.getAttribute("data-mbah-lock") === "true") continue;

            let jumlahBalasanMbah = parseInt(post.getAttribute("data-mbah-counter") || "0");
            if (jumlahBalasanMbah >= 3) continue; 

            const postAuthor = post.querySelector(".user")?.innerText.trim() || "";
            if (postAuthor === "@system" || postAuthor === BOT_USERNAME || postAuthor === "") continue;

            const kontenTeksUtama = post.querySelector(".text")?.innerText || "";
            
            // Ambil semua elemen teks terdalam di pos ini
            const seluruhBalonTeks = post.querySelectorAll("p, span, div, li");
            
            let adaMentionMbahMurni = false;
            let mbahSudahPernahKomentar = false;
            let teksKomentarTerakhirUser = "";

            seluruhBalonTeks.forEach((elemen) => {
                if (elemen.tagName === "INPUT" || elemen.tagName === "TEXTAREA" || elemen.classList.contains("comment-input")) return;
                
                const teksMentah = elemen.innerText || "";
                
                if (teksMentah.includes("Petapa Menoreh") || elemen.getAttribute("data-comment-author") === BOT_USERNAME) {
                    mbahSudahPernahKomentar = true;
                }

                if (teksMentah.trim() !== "" && !teksMentah.includes("Petapa Menoreh") && elemen.getAttribute("data-comment-author") !== BOT_USERNAME) {
                    teksKomentarTerakhirUser = teksMentah;
                    if (teksMentah.includes(BOT_USERNAME)) {
                        adaMentionMbahMurni = true;
                    }
                }
            });

            let lolosGerbang = false;
            let bahanTulisanAI = kontenTeksUtama;

            if (!mbahSudahPernahKomentar) {
                console.log(`👴 [Mbah Eko] Menemukan postingan baru dari ${postAuthor}. Bersiap menyapa pertama kali.`);
                lolosGerbang = true;
            } else if (teksKomentarTerakhirUser !== "") {
                const hashObrolan = btoa(unescape(encodeURIComponent(teksKomentarTerakhirUser))).substring(0, 12);
                
                if (post.getAttribute("data-mbah-mention-read") !== hashObrolan) {
                    console.log(`👴 [Mbah Eko] Mendengar jagongan baru: "${teksKomentarTerakhirUser}"`);
                    lolosGerbang = true;
                    bahanTulisanAI = `[PENGGUNA LANJUT NGOBROL DENGANMU: "${teksKomentarTerakhirUser}"]\n\nKonteks: ${kontenTeksUtama}`;
                    post.setAttribute("data-mbah-mention-read", hashObrolan);
                }
            }

            if (lolosGerbang) {
                post.setAttribute("data-mbah-lock", "true"); 
                sedangMemprosesKomentar = true;

                jumlahBalasanMbah++;
                post.setAttribute("data-mbah-counter", jumlahBalasanMbah.toString());

                console.log("👴 [Mbah Eko] Menyeberang jembatan API Cloudflare...");
                await kirimKeJembatan(post, bahanTulisanAI, postAuthor);
                
                post.removeAttribute("data-mbah-lock");
                setTimeout(() => { sedangMemprosesKomentar = false; }, 1000);
            }
        }
    }

    async function kirimKeJembatan(elemenPost, teksUser, author) {
        try {
            const res = await fetch(URL_JEMBATAN_CLOUDFLARE, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instruksiSistem: `Kamu adalah ${BOT_USERNAME} sesepuh bijak ToFarmer. Jawab halus pakai sapaan Kang/Ger/Njenengan.`,
                    tulisanUser: `Post dari ${author}: "${teksUser}"`
                })
            });

            if (res.ok) {
                const data = await res.json();
                console.log("👴 [Mbah Eko] Dapat balasan dari AI:", data.balasanMbah);
                if (data.balasanMbah) {
                    suntikKomentarKeHTML(elemenPost, data.balasanMbah);
                }
            } else {
                console.warn("👴 [Mbah Eko] Jembatan menolak, status:", res.status);
            }
        } catch (e) { 
            console.error("👴 [Mbah Eko] Gagal total lewat jembatan:", e); 
        }
    }

    function suntikKomentarKeHTML(elemenPost, teksBalasanMbah) {
        let wadahKomentar = elemenPost.querySelector(".comments-box-list, .comments-section, .post-actions") || elemenPost;
        
        const htmlMbah = `
            <div class="comment-item" data-comment-author="${BOT_USERNAME}" style="display: flex; gap: 10px; margin-top: 12px; padding: 12px; background: #fdf6e2; border-left: 4px solid #2f6f4e; border-radius: 10px; text-align: left;">
                <div style="font-size: 18px;">👴</div>
                <div style="font-size: 12px; color: #1c2b22; width: 100%;">
                    <strong>${BOT_USERNAME}</strong> <span style="font-size: 10px; color: #8a9a90;">Petapa Menoreh</span>
                    <p style="margin: 4px 0 0 0; white-space: pre-wrap;">${teksBalasanMbah}</p>
                </div>
            </div>
        `;
        wadahKomentar.insertAdjacentHTML("beforeend", htmlMbah);
        console.log("👴 [Mbah Eko] Berhasil menyuntikkan komentar ke layar!");
    }

    const targetFeed = document.getElementById("feed") || document.body;
    const observer = new MutationObserver(periksaDanSapaFeed);
    observer.observe(targetFeed, { childList: true, subtree: true, characterData: true });
})();