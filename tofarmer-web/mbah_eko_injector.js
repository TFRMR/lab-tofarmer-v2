(function() {
    console.log("👴 [Mbah Eko - Operator Akun] Jalur Tembak Langsung Supabase Aktif...");

    const URL_RESMI = "https://tofarmer-api.tofarmer-api.workers.dev/ai-saran"; 
    const BOT_USERNAME = "@mbah_eko";
    let sedangMemproses = false;

    async function periksaSkenarioMading() {
        if (sedangMemproses) return;

        const semuaPostingan = document.querySelectorAll("#feed .post, #userPosts .post, .post, #profilePosts .post, .post, [id^='post-card-']");
        if (!semuaPostingan.length) return;

        for (const post of semuaPostingan) {
            const postId = post.getAttribute("data-id") || post.id?.replace("post-card-", "") || post.id;
            if (!postId || post.getAttribute("data-operator-lock") === "true") continue;

            const kontenTeksUtama = post.querySelector(".text, .deskripsi-proses")?.innerText || "";
            const elemenKomentar = post.querySelectorAll("[data-comment-author], .comment-item, .comment-box p, .comment-text, .tof-mention");
            
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
                // Skenario Sapa Postingan Baru
                const sudahKomen = await cekApakahSudahKomentar(postId);
                if (!sudahKomen) {
                    terpicu = true;
                    jenisSkenario = "POSTINGAN_BARU";
                }
            } else if (teksKomentarTerakhir.toLowerCase().includes(BOT_USERNAME.toLowerCase())) {
                // Skenario Mention (Abaikan sudahKomen, tetap balas)
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
                    : "Eksplorasi ilmu, berbagi perspektif, dan tumbuh bersama melalui aksi nyata.";

                const daftarPilar = `1. Komunitas & Narasi Kreatif, 2. Inovasi & Rekayasa Teknologi, 3. Proyek & Aksi Nyata, 4. Finansial & Investasi, 5. Refleksi & Pembelajaran`;

                let instruksi = `Kamu adalah @mbah_eko, sobat tongkrongan yang sama-sama merintis. Pakai kata "kita". Analisis santai, akrab, ngeledek akrab. Jangan sok tahu. Balas langsung poin user. Tutup dengan refleksi hangat. Landasan: ${memoPaper}. Pilar: ${daftarPilar}`;

                const promptMatang = `${instruksi}\n\nPost: "${kontenTeksUtama}"\nKomentar: "${teksKomentarTerakhir}"\n\nBalasan akrab & reflektif:`;
                const tanggapanAI = await panggilOtakAI(promptMatang);

                if (tanggapanAI && window.supabaseClient) {
                    const { error } = await window.supabaseClient.from("comments").insert([{
                        post_id: parseInt(postId),
                        user_id: "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY",
                        comment: tanggapanAI
                    }]);

                    if (!error) {
                        console.log(`🎯 [Operator] Sukses! Komentar @mbah_eko sah.`);
                        if (typeof window.loadFeed === "function") {
                            setTimeout(() => window.loadFeed(), 1500);
                        }
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

    async function cekApakahSudahKomentar(postId) {
        if (!window.supabaseClient) return false;
        const { data, error } = await window.supabaseClient
            .from("comments")
            .select("id")
            .eq("post_id", parseInt(postId))
            .eq("user_id", "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY")
            .limit(1);
        return error ? false : (data.length > 0);
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

    const observer = new MutationObserver(periksaSkenarioMading);
    observer.observe(document.body, { childList: true, subtree: true });
    
    setTimeout(periksaSkenarioMading, 4000); 

    window.addEventListener('load', () => {
        setTimeout(periksaSkenarioMading, 2000); 
    });

})();