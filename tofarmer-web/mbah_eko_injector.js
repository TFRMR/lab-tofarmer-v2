(function() {
    console.log("👴 [Mbah Eko - Final Mode] Jalur Supabase & Persona Aktif...");

    const URL_RESMI = "https://tofarmer-api.tofarmer-api.workers.dev/ai-saran";
    const BOT_USERNAME = "@mbah_eko";
    const MB_USER_ID = "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY";
    let sedangMemproses = false;

    async function periksaSkenarioMading() {
        if (sedangMemproses) return;

        const semuaPostingan = document.querySelectorAll(".post, [id^='post-card-']");
        for (const post of semuaPostingan) {
            const postId = post.getAttribute("data-id") || post.id?.replace("post-card-", "");
            if (!postId || post.getAttribute("data-operator-lock") === "true") continue;

            // CEK RIWAYAT DI SUPABASE (Anti-Spam & Kebal Hapus Browser)
            const { data: historiMbah } = await window.supabaseClient
                .from("comments")
                .select("id")
                .eq("post_id", parseInt(postId))
                .eq("user_id", MB_USER_ID);

            const sudahPernahKomen = historiMbah && historiMbah.length > 0;

            const kontenTeksUtama = post.querySelector(".text, .deskripsi-proses")?.innerText || "";
            const komentarElemen = post.querySelectorAll("[data-comment-author], .comment-text");
            const komentarTerakhir = komentarElemen[komentarElemen.length - 1]?.innerText || "";
            
            // Filter: Jangan balas komentar sendiri
            if (komentarTerakhir.includes(BOT_USERNAME)) continue;

            let terpicu = false;
            let instruksi = "";

            // LOGIKA PEMICU:
            if (!sudahPernahKomen) {
                // Skenario 1: Postingan baru -> Sapa 1x saja
                terpicu = true;
                instruksi = `Kamu @mbah_eko. User baru posting: "${kontenTeksUtama}". Berikan sapaan hangat singkat, apresiasi karyanya, dan sambut dengan ramah. Jangan bertanya balik.`;
            } else if (komentarTerakhir.toLowerCase().includes(BOT_USERNAME.toLowerCase())) {
                // Skenario 2: Sudah pernah sapa -> Hanya balas jika dimention
                terpicu = true;
                let ilmu = await cariIlmu(kontenTeksUtama + " " + komentarTerakhir);
                instruksi = `Kamu @mbah_eko. Respon panggilan/pertanyaan user: "${komentarTerakhir}". 
                Konteks diskusi: "${kontenTeksUtama}".
                Referensi ilmu (bumbu diskusi): ${ilmu || "Gunakan naluri tongkronganmu."}.
                Jawablah dengan gaya santai, akrab, solutif, dan tidak menggurui. Jika user hanya menyapa, balaslah dengan sapaan balik yang hangat.`;
            }

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
                    if (typeof window.loadFeed === "function") window.loadFeed();
                }

                post.removeAttribute("data-operator-lock");
                sedangMemproses = false;
                break; // Proses satu per satu agar stabil
            }
        }
    }

    async function cariIlmu(query) {
        if (!window.supabaseClient) return "";
        const res = await fetch("https://tofarmer-api.tofarmer-api.workers.dev/get-embedding", { method: "POST", body: JSON.stringify({ text: query }) });
        const { embedding } = await res.json();
        const { data } = await window.supabaseClient.rpc('match_knowledge', { query_embedding: embedding, match_threshold: 0.6, match_count: 3 });
        return data ? data.map(item => item.content).join("\n\n") : "";
    }

    async function panggilOtakAI(prompt) {
        try {
            const res = await fetch(URL_RESMI, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "komentar", prompt: prompt, teks: prompt }) });
            const json = await res.json();
            return json.saran || json.reply || "";
        } catch (e) { return ""; }
    }

    // Pemicu observer untuk memantau perubahan mading
    const observer = new MutationObserver(periksaSkenarioMading);
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Pemicu awal
    setTimeout(periksaSkenarioMading, 2000);
})();