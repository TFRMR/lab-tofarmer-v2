(function() {
    console.log("👴 [Mbah Eko - Operator Akun] Final Mode: Fokus & Anti-Spam Aktif...");

    const URL_RESMI = "https://tofarmer-api.tofarmer-api.workers.dev/ai-saran"; 
    const BOT_USERNAME = "@mbah_eko";
    let sedangMemproses = false;

    async function periksaSkenarioMading() {
        if (sedangMemproses) return;

        const semuaPostingan = document.querySelectorAll("#feed .post, #userPosts .post, .post, #profilePosts .post, [id^='post-card-']");
        if (!semuaPostingan.length) return;

        for (const post of semuaPostingan) {
            const postId = post.getAttribute("data-id") || post.id?.replace("post-card-", "") || post.id;
            if (!postId || post.getAttribute("data-operator-lock") === "true") continue;

            const sudahKomen = await cekApakahSudahKomentar(postId);
            if (sudahKomen) continue;

            const kontenTeksUtama = post.querySelector(".text, .deskripsi-proses")?.innerText || "";
            const elemenKomentar = post.querySelectorAll("[data-comment-author], .comment-item, .comment-box p, .comment-text, .tof-mention");
            
            let daftarKomentar = [];
            let mbahPernahKomentar = false;

            elemenKomentar.forEach((el) => {
                if (el.id === 'advice-box' || el.id === 'ai-text' || el.closest('#advice-container')) return;
                const penulis = el.getAttribute("data-comment-author") || el.querySelector(".comment-author")?.innerText || "";
                if (penulis.includes("mbah_eko")) return;
                const teks = (el.innerText || "").trim();
                if (teks === "" || teks.startsWith("Kirim") || teks.startsWith("Sruput")) return;
                if (penulis.includes("mbah_eko") || teks.includes("@mbah_eko") || teks.includes("Petapa Menoreh")) mbahPernahKomentar = true;
                daftarKomentar.push({ author: penulis.replace("@", "").trim(), text: teks });
            });

            const komentarTerakhir = daftarKomentar[daftarKomentar.length - 1] || null;
            if (!komentarTerakhir || mbahPernahKomentar) continue;

            // --- FILTER ANTI-SPAM: Hanya balas jika komentar > 15 karakter ---
            if (komentarTerakhir.text.length < 15) continue;

            const hashKomentar = btoa(unescape(encodeURIComponent(komentarTerakhir.text + komentarTerakhir.author))).substring(0, 12);
            let terpicu = (!localStorage.getItem(`op_sapa_${postId}`));
            if (komentarTerakhir.text.toLowerCase().includes(BOT_USERNAME.toLowerCase()) && localStorage.getItem(`op_mention_${postId}`) !== hashKomentar) terpicu = true;

            if (terpicu) {
                post.setAttribute("data-operator-lock", "true");
                sedangMemproses = true;

                // --- PERSONA & LOGIKA PINTAR ---
                let ilmuTambahan = await cariIlmu(kontenTeksUtama + " " + komentarTerakhir.text);
                let instruksi = `Kamu @mbah_eko, teman diskusi yang santai.
                TUGAS: Jawab komentar user dengan jujur, akrab, dan reflektif.
                Gunakan "Ilmu Tambahan" ini HANYA sebagai referensi, JANGAN DI-COPY MENTAH: ${ilmuTambahan || "Gunakan nalurimu."}
                
                Post: "${kontenTeksUtama}"
                User: "${komentarTerakhir.text}"`;

                const tanggapanAI = await panggilOtakAI(instruksi);

                if (tanggapanAI && window.supabaseClient) {
                    await window.supabaseClient.from("comments").insert([{
                        post_id: parseInt(postId),
                        user_id: "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY",
                        comment: tanggapanAI
                    }]);
                    
                    localStorage.setItem(`op_sapa_${postId}`, "done");
                    localStorage.setItem(`op_mention_${postId}`, hashKomentar);
                    if (typeof window.loadFeed === "function") setTimeout(window.loadFeed, 1500);
                }

                post.removeAttribute("data-operator-lock");
                setTimeout(() => { sedangMemproses = false; }, 4000);
                break;
            }
        }
    }

    async function cariIlmu(queryTeks) {
        if (!window.supabaseClient) return "";
        const res = await fetch("https://tofarmer-api.tofarmer-api.workers.dev/get-embedding", { method: "POST", body: JSON.stringify({ text: queryTeks }) });
        const { embedding } = await res.json();
        // --- THRESHOLD 0.6: Lebih selektif, lebih nyambung ---
        const { data } = await window.supabaseClient.rpc('match_knowledge', { query_embedding: embedding, match_threshold: 0.6, match_count: 3 });
        return data ? data.map(item => item.content).join("\n\n") : "";
    }

    async function cekApakahSudahKomentar(postId) {
        if (!window.supabaseClient) return false;
        const { data } = await window.supabaseClient.from("comments").select("id").eq("post_id", parseInt(postId)).eq("user_id", "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY").limit(1);
        return data ? data.length > 0 : false;
    }

    async function panggilOtakAI(promptTeks) {
        try {
            const res = await fetch(URL_RESMI, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "komentar", prompt: promptTeks, teks: promptTeks }) });
            const json = await res.json();
            return json.saran || json.reply || "";
        } catch (e) { return ""; }
    }

    const observer = new MutationObserver(periksaSkenarioMading);
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(periksaSkenarioMading, 4000);
})();