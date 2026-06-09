(function() {
    console.log("👴 [Mbah Eko - Operator Akun] Jalur Tembak Langsung Supabase Aktif...");

    const URL_RESMI = "https://tofarmer-api.tofarmer-api.workers.dev/ai-saran"; 
    const BOT_USERNAME = "@mbah_eko";
    let sedangMemproses = false;

    async function periksaSkenarioMading() {
        if (sedangMemproses) return;

        const semuaPostingan = document.querySelectorAll("#feed-container .post, #posts .post, .post, [id^='post-card-']"); 
        if (!semuaPostingan.length) return;

        for (const post of semuaPostingan) {
            if (post.getAttribute("data-operator-lock") === "true") continue;

            const postId = post.getAttribute("data-id") || post.id?.replace("post-card-", "") || post.id;
            if (!postId) continue;

            const kontenTeksUtama = post.querySelector(".text, .deskripsi-proses")?.innerText || "";
            const elemenKomentar = post.querySelectorAll("[data-comment-author], .comment-item, .comment-box p, .comment-text");
            
            let daftarKomentar = [];
            let mbahPernahKomentar = false;

            elemenKomentar.forEach((el) => {
                if (el.id === 'advice-box' || el.id === 'ai-text' || el.closest('#advice-container')) return;

                const penulis = el.getAttribute("data-comment-author") || el.querySelector(".comment-author")?.innerText || "";
                const teks = (el.innerText || "").trim();
                
                if (teks === "" || teks.startsWith("Kirim") || teks.startsWith("Sruput")) return;

                if (penulis.includes("mbah_eko") || teks.includes("@mbah_eko") || teks.includes("Petapa Menoreh")) {
                    mbahPernahKomentar = true;
                }

                daftarKomentar.push({ author: penulis.replace("@", "").trim(), text: teks });
            });

            const komentarTerakhir = daftarKomentar[daftarKomentar.length - 1] || null;
            const teksKomentarTerakhir = komentarTerakhir ? komentarTerakhir.text : "";
            const penulisKomentarTerakhir = komentarTerakhir ? komentarTerakhir.author : "";
            const hashKomentar = btoa(unescape(encodeURIComponent(teksKomentarTerakhir + penulisKomentarTerakhir))).substring(0, 12);

            let terpicu = false;
            let jenisSkenario = "";

            if (!mbahPernahKomentar && !localStorage.getItem(`op_sapa_${postId}`)) {
                terpicu = true;
                jenisSkenario = "POSTINGAN_BARU";
            } else if (teksKomentarTerakhir.toLowerCase().includes(BOT_USERNAME.toLowerCase())) {
                if (localStorage.getItem(`op_mention_${postId}`) !== hashKomentar) {
                    terpicu = true;
                    jenisSkenario = "MENTION_LANGSUNG";
                }
            }

            if (terpicu) {
                post.setAttribute("data-operator-lock", "true");
                sedangMemproses = true;

                if (jenisSkenario === "POSTINGAN_BARU") localStorage.setItem(`op_sapa_${postId}`, "done");
                if (jenisSkenario === "MENTION_LANGSUNG") localStorage.setItem(`op_mention_${postId}`, hashKomentar);

                let memoPaper = typeof window.cariKonteksPaper === "function" 
                    ? window.cariKonteksPaper(teksKomentarTerakhir + " " + kontenTeksUtama)
                    : "Pertanian sebagai aktivitas intelektual, rekam jejak, jujur berproses, dan refleksi mendalam.";
                
                let instruksi = `Kamu adalah @mbah_eko, sesepuh ToFarmer. Landasan: ${memoPaper}.\n`;
                instruksi += jenisSkenario === "POSTINGAN_BARU" 
                    ? "Tugas: Beri petuah bijak singkat (1-2 kalimat) apresiasi proses. Sapaan khas: 'Ngger', 'Kang', 'Njenengan'."
                    : "Tugas: Jawab pertanyaan dengan mengalir, santai, kearifan Menoreh. Maksimal 2 kalimat.";

                const promptMatang = `${instruksi}\n\nPost: "${kontenTeksUtama}"\nKomentar: "${teksKomentarTerakhir}"\n\nBalasan:`;
                const tanggapanAI = await panggilOtakAI(promptMatang);

                // EKSEKUSI SUPABASE (Menggunakan akses sah dari window)
                if (tanggapanAI && window.supabaseClient) {
                    const { error } = await window.supabaseClient
                        .from("comments") 
                        .insert([{
                            post_id: parseInt(postId),
                            user_id: "mbah_eko",
                            comment: tanggapanAI
                        }]);

                    if (!error) {
                        console.log(`🎯 [Operator] Sukses! Komentar @mbah_eko sah masuk database.`);
                        if (typeof window.loadFeed === "function") window.loadFeed();
                    } else {
                        console.error("❌ Supabase menolak:", error.message);
                    }
                }

                post.removeAttribute("data-operator-lock");
                setTimeout(() => { sedangMemproses = false; }, 4000);
                break;
            }
        }
    }

    async function panggilOtakAI(promptTeks) {
        try {
            const res = await fetch(URL_RESMI, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "komentar", prompt: promptTeks, teks: promptTeks })
            });
            const json = await res.json();
            return json.saran || json.reply || "";
        } catch (e) { return ""; }
    }

    const targetMading = document.getElementById("feed") || document.getElementById("feed-container") || document.body;
    const observer = new MutationObserver(periksaSkenarioMading);
    observer.observe(targetMading, { childList: true, subtree: true });
    
    setTimeout(periksaSkenarioMading, 4000);
})();