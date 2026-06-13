(function() {
    console.log("👴 [Mbah Eko - Final Lock] Sistem Anti-Spam & Self-Mention terkunci...");

    const URL_RESMI = "https://tofarmer-api.tofarmer-api.workers.dev/ai-saran";
    const BOT_USERNAME = "@mbah_eko";
    const MB_USER_ID = "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY";
    let sedangMemproses = false;

    async function periksaSkenarioMading() {
        if (sedangMemproses) return;

        const semuaPostingan = document.querySelectorAll(".post, [id^='post-card-']");
        for (const post of semuaPostingan) {
            const postId = post.getAttribute("data-id") || post.id?.replace("post-card-", "");
            if (!postId) continue;

            // 1. TEMBOK PELINDUNG: Cek histori dari database Supabase
            const { data: historiMbah } = await window.supabaseClient
                .from("comments")
                .select("id")
                .eq("post_id", parseInt(postId))
                .eq("user_id", MB_USER_ID);

            const sudahPernahKomen = historiMbah && historiMbah.length > 0;
            
            // Jika sudah pernah komen, kunci permanen dan lewatkan
            if (sudahPernahKomen) {
                post.setAttribute("data-operator-lock", "true");
                continue;
            }

            if (post.getAttribute("data-operator-lock") === "true") continue;

            // 2. FILTER PENULIS: Jangan pedulikan komentar Mbah Eko sendiri
            const kontenTeksUtama = post.querySelector(".text, .deskripsi-proses")?.innerText || "";
            const elemenKomentar = post.querySelectorAll("[data-comment-author], .comment-item, .comment-box p, .comment-text, .tof-mention");
            
            let mbahPernahKomenDiSini = false;
            let daftarKomentar = [];

            elemenKomentar.forEach((el) => {
                const penulis = el.getAttribute("data-comment-author") || el.querySelector(".comment-author")?.innerText || "";
                // Deteksi super ketat untuk self-mention
                if (penulis.toLowerCase().includes("mbah_eko")) mbahPernahKomenDiSini = true;
                
                const teks = (el.innerText || "").trim();
                if (teks !== "") daftarKomentar.push({ author: penulis.replace("@", "").trim(), text: teks });
            });

            if (mbahPernahKomenDiSini) continue;

            const komentarTerakhir = daftarKomentar[daftarKomentar.length - 1] || null;
            if (!komentarTerakhir) continue;

            // 3. LOGIKA PEMICU
            let terpicu = false;
            let instruksi = "";

            // Hanya sapa postingan baru yang belum ada komen Mbah
            terpicu = true;
            instruksi = `Kamu adalah teman diskusi yang bijak. User baru posting: "${kontenTeksUtama}". 
            Berikan apresiasi singkat terhadap karya/postingan tersebut. 
            ATURAN MUTLAK: JANGAN sebut namamu sendiri (@mbah_eko), JANGAN sapa dirimu sendiri, JANGAN bertanya balik. Cukup berikan apresiasi yang tulus dan semangat.`;

            if (terpicu) {
                post.setAttribute("data-operator-lock", "true");
                sedangMemproses = true;

                const tanggapanAI = await panggilOtakAI(instruksi);
                
                if (tanggapanAI) {
                    await window.supabaseClient.from("comments").insert([{
                        post_id: parseInt(postId),
                        user_id: MB_USER_ID,
                        comment: tanggapanAI
                    }]);
                    console.log("✅ [Mbah Eko] Sapaan elegan berhasil dikirim.");
                    if (typeof window.loadFeed === "function") window.loadFeed();
                }

                sedangMemproses = false;
                break; 
            }
        }
    }

    async function panggilOtakAI(prompt) {
        try {
            const res = await fetch(URL_RESMI, { 
                method: "POST", 
                headers: { "Content-Type": "application/json" }, 
                body: JSON.stringify({ mode: "komentar", prompt: prompt, teks: prompt }) 
            });
            const json = await res.json();
            return json.saran || json.reply || "";
        } catch (e) { return ""; }
    }

    const observer = new MutationObserver(periksaSkenarioMading);
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(periksaSkenarioMading, 3000);
})();