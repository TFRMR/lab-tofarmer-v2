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

        // Cari elemen post secara fleksibel (baik di dalam #feed atau kelas .post langsung)
        const semuaPostingan = document.querySelectorAll("#feed .post, .post"); 
        if (!semuaPostingan.length) return;

        for (const post of semuaPostingan) {
            if (post.getAttribute("data-mbah-lock") === "true") continue;

            let jumlahBalasanMbah = parseInt(post.getAttribute("data-mbah-counter") || "0");
            if (jumlahBalasanMbah >= 3) continue; 

            // Ambil konten teks utama postingan agar tidak tertukar dengan komentar
            const kontenTeksUtama = post.querySelector(".text")?.innerText || "";
            
            // Mengambil semua elemen teks (p, span, div) di dalam postingan ini
            const seluruhBalonTeks = post.querySelectorAll("p, span, div");
            
            let mbahSudahPernahKomentar = false;
            let teksKomentarTerakhirUser = "";

            seluruhBalonTeks.forEach((elemen) => {
                // Abaikan kolom input tempat mengetik komentar
                if (elemen.tagName === "INPUT" || elemen.tagName === "TEXTAREA" || elemen.classList.contains("comment-input") || elemen.closest(".comment-form")) return;
                
                const teksMentah = elemen.innerText || "";
                
                // Cek apakah si Mbah sudah pernah nimbrung di pos ini
                if (teksMentah.includes("Petapa Menoreh") || elemen.getAttribute("data-comment-author") === BOT_USERNAME) {
                    mbahSudahPernahKomentar = true;
                }

                // SUNTIK LINK OTOMATIS: Mengubah @username teks mati menjadi link profil aktif hidup
                if (teksMentah.includes("@") && !elemen.querySelector("a") && elemen.children.length === 0) {
                    const htmlAsli = elemen.innerHTML;
                    const htmlBaru = htmlAsli.replace(/@([a-zA-Z0-9_]+)/g, function(match, username) {
                        return `<a href="profile.html?user=${username}" style="color: #2f6f4e; font-weight: 600; text-decoration: none; border-bottom: 1px dashed #2f6f4e;">@${username}</a>`;
                    });
                    if (htmlAsli !== htmlBaru) {
                        elemen.innerHTML = htmlBaru;
                    }
                }

                // Catat komentar terakhir dari user biasa (bukan si Mbah) untuk direspon secara alami
                if (teksMentah.trim() !== "" && !teksMentah.includes("Petapa Menoreh") && elemen.getAttribute("data-comment-author") !== BOT_USERNAME && !teksMentah.includes("Komentar") && !teksMentah.includes("Sruput")) {
                    // Pastikan teks yang diambil bukan label tombol seperti "Kirim" atau "Komentar"
                    if (teksMentah.trim() !== "Kirim" && teksMentah.trim() !== "Komentar") {
                        teksKomentarTerakhirUser = teksMentah;
                    }
                }
            });

            let lolosGerbang = false;
            let bahanTulisanAI = kontenTeksUtama;

            if (!mbahSudahPernahKomentar) {
                console.log("👴 [Mbah Eko] Menemukan postingan baru gres. Bersiap memberikan sambutan.");
                lolosGerbang = true;
            } else if (teksKomentarTerakhirUser !== "") {
                const hashObrolan = btoa(unescape(encodeURIComponent(teksKomentarTerakhirUser))).substring(0, 12);
                
                if (post.getAttribute("data-mbah-mention-read") !== hashObrolan) {
                    console.log(`👴 [Mbah Eko] Mendengar jagongan baru di komentar: "${teksKomentarTerakhirUser}"`);
                    lolosGerbang = true;
                    bahanTulisanAI = `[PENGGUNA LANJUT NGOBROL DENGANMU DI KOMENTAR: "${teksKomentarTerakhirUser}"]\n\nKonteks postingan utama: ${kontenTeksUtama}`;
                    post.setAttribute("data-mbah-mention-read", hashObrolan);
                }
            }

            if (lolosGerbang) {
                post.setAttribute("data-mbah-lock", "true"); 
                sedangMemprosesKomentar = true;

                jumlahBalasanMbah++;
                post.setAttribute("data-mbah-counter", jumlahBalasanMbah.toString());

                console.log("👴 [Mbah Eko] Menghubungi Jembatan Cloudflare Worker...");
                await kirimKeJembatan(post, bahanTulisanAI);
                
                post.removeAttribute("data-mbah-lock");
                setTimeout(() => { sedangMemprosesKomentar = false; }, 1000);
            }
        }
    }

    async function kirimKeJembatan(elemenPost, teksUser) {
        try {
            const res = await fetch(URL_JEMBATAN_CLOUDFLARE, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instruksiSistem: `Kamu adalah ${BOT_USERNAME}, sesepuh digital yang adem, sopan, dan sangat bijak di ekosistem ToFarmer. Aturan Bahasa Mutlak: JANGAN PERNAH gunakan kata sapaan 'le' atau 'nduk'! Ganti dengan sapaan halus penyejuk hati: 'Ger' (Ngger), 'Kang', 'Mbak', 'Njenengan', atau 'Sedulur'. Jawab ringkas, padat, penuh petuah tua, mengalir alami seperti obrolan warung kopi (jagongan).`,
                    tulisanUser: `Obrolan: "${teksUser}"`
                })
            });

            if (res.ok) {
                const data = await res.json();
                console.log("👴 [Mbah Eko] Mendapat balasan dari AI:", data.balasanMbah);
                if (data.balasanMbah) {
                    suntikKomentarKeHTML(elemenPost, data.balasanMbah);
                }
            } else {
                console.warn("👴 [Mbah Eko] Jembatan Cloudflare merespon status:", res.status);
            }
        } catch (e) { 
            console.error("👴 [Mbah Eko] Gagal mendayung melewati jembatan:", e); 
        }
    }

    function suntikKomentarKeHTML(elemenPost, teksBalasanMbah) {
        // Cari kontainer list komentar bawaan web Njenengan secara fleksibel
        let wadahKomentar = elemenPost.querySelector(".comments-box-list, .comments-section, .post-actions") || elemenPost;
        
        const htmlMbah = `
            <div class="comment-item" data-comment-author="${BOT_USERNAME}" style="display: flex; gap: 10px; margin-top: 12px; padding: 12px; background: #fdf6e2; border-left: 4px solid #2f6f4e; border-radius: 10px; text-align: left;">
                <div style="font-size: 18px; margin-top: 2px;">👴</div>
                <div style="font-size: 12px; font-family: sans-serif; color: #1c2b22; width: 100%;">
                    <a href="profile.html?user=mbah_eko" style="text-decoration: none; color: #2f6f4e; display: block; margin-bottom: 2px; font-weight: bold;">
                        ${BOT_USERNAME} <span style="font-size: 10px; font-weight: normal; color: #8a9a90; background: rgba(47,111,78,0.1); padding: 1px 6px; border-radius: 4px; margin-left: 4px;">Petapa Menoreh</span>
                    </a>
                    <span style="white-space: pre-wrap; line-height: 1.6; color: #2c3a33;">${teksBalasanMbah}</span>
                </div>
            </div>
        `;

        wadahKomentar.insertAdjacentHTML("beforeend", htmlMbah);
        console.log("👴 [Mbah Eko] Berhasil menyuntikkan komentar balasan ke layar!");
    }

    // Mengamati perubahan dokumen secara agresif demi menangkap ketikan lokal
    const targetFeed = document.body;
    const observer = new MutationObserver(periksaDanSapaFeed);
    observer.observe(targetFeed, { childList: true, subtree: true, characterData: true });
})();