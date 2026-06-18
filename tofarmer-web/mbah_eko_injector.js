(function() {
    console.log("👴 [Mbah Eko] Aktif...");

    const URL_RESMI = "https://tofarmer-api.tofarmer-api.workers.dev/ai-saran";
    const BOT_USERNAME = "@mbah_eko";
    const BOT_USER_ID = "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY";
    let sedangMemproses = false;

    function buatHash(str) {
        return btoa(unescape(encodeURIComponent(str))).substring(0, 16);
    }

    // ─── Cek apakah teks/penulis adalah bot sendiri ──────────────────────
    function adalahDiriSendiri(penulis, teks) {
        return (
            penulis.includes("mbah_eko") ||
            teks.includes("Petapa Menoreh") ||
            teks.startsWith("[MENTION_HANDLED:")
        );
    }

    // ─── Bersihkan sebutan diri sendiri dari teks sebelum ke AI ─────────
    function bersihkanTeks(teks) {
        return teks
            .replace(/@mbah_eko/gi, "")
            .replace(/mbah eko/gi, "")
            .replace(/Petapa Menoreh/gi, "")
            .trim();
    }

    function ambilKonteksPost(post) {
        const kontenUtama = post.querySelector(".text, .deskripsi-proses")?.innerText?.trim() || "";
        const elemenKomentar = post.querySelectorAll(
            "[data-comment-author], .comment-item, .comment-box p, .comment-text, .tof-mention"
        );

        let daftarKomentar = [];
        let mbahPernahKomentar = false;

        elemenKomentar.forEach((el) => {
            if (el.id === 'advice-box' || el.id === 'ai-text' || el.closest('#advice-container')) return;
            const penulis = el.getAttribute("data-comment-author") || el.querySelector(".comment-author")?.innerText || "";
            const teks = (el.innerText || "").trim();
            if (!teks || teks.startsWith("Kirim") || teks.startsWith("Sruput")) return;

            if (adalahDiriSendiri(penulis, teks)) {
                mbahPernahKomentar = true;
                return; // Komentar bot sendiri tidak masuk daftarKomentar
            }

            daftarKomentar.push({ author: penulis.replace("@", "").trim(), text: teks });
        });

        // Komentar terakhir yang valid = bukan dari bot sendiri
        const komentarTerakhir = daftarKomentar[daftarKomentar.length - 1] || null;
        return { kontenUtama, daftarKomentar, komentarTerakhir, mbahPernahKomentar };
    }

    async function cekSudahKomentarBiasa(postId) {
        if (!window.supabaseClient) return false;
        const { data, error } = await window.supabaseClient
            .from("comments")
            .select("id")
            .eq("post_id", parseInt(postId))
            .eq("user_id", BOT_USER_ID)
            .not("comment", "like", "[MENTION_HANDLED:]%")
            .limit(1);
        return error ? false : data.length > 0;
    }

    async function cekSudahTanganiMention(postId, hash) {
        if (!window.supabaseClient) return false;
        const { data, error } = await window.supabaseClient
            .from("comments")
            .select("id")
            .eq("post_id", parseInt(postId))
            .eq("user_id", BOT_USER_ID)
            .eq("comment", `[MENTION_HANDLED:${hash}]`)
            .limit(1);
        return error ? false : data.length > 0;
    }

    async function tandaiMentionSudahDitangani(postId, hash) {
        if (!window.supabaseClient) return;
        await window.supabaseClient
            .from("comments")
            .insert([{
                post_id: parseInt(postId),
                user_id: BOT_USER_ID,
                comment: `[MENTION_HANDLED:${hash}]`
            }]);
    }

    async function periksaSkenarioMading() {
        if (sedangMemproses) return;

        const semuaPostingan = document.querySelectorAll(
            "#feed .post, #userPosts .post, #profilePosts .post, .post, [id^='post-card-']"
        );
        if (!semuaPostingan.length) return;

        for (const post of semuaPostingan) {
            const postId = post.getAttribute("data-id") || post.id?.replace("post-card-", "") || post.id;
            if (!postId || post.getAttribute("data-operator-lock") === "true") continue;

            const { kontenUtama, daftarKomentar, komentarTerakhir, mbahPernahKomentar } = ambilKonteksPost(post);

            const teksKomentarTerakhir = komentarTerakhir?.text || "";
            const penulisKomentarTerakhir = komentarTerakhir?.author || "";

            // Komentar terakhir dari bot sendiri → skip total, tidak perlu cek apapun
            if (adalahDiriSendiri(penulisKomentarTerakhir, teksKomentarTerakhir)) continue;

            // ── SKENARIO MENTION ─────────────────────────────────────────
            const adaMention = teksKomentarTerakhir.toLowerCase().includes(BOT_USERNAME.toLowerCase());

            if (adaMention) {
                const hashMention = buatHash(teksKomentarTerakhir + penulisKomentarTerakhir + postId);
                const sudahDitangani = await cekSudahTanganiMention(postId, hashMention);
                if (sudahDitangani) continue;

                await eksekusi(post, postId, "MENTION_LANGSUNG", {
                    kontenUtama, daftarKomentar, teksKomentarTerakhir, penulisKomentarTerakhir, hashMention
                });
                break;
            }

            // ── SKENARIO POSTING BARU ────────────────────────────────────
            if (mbahPernahKomentar) continue;

            const sudahKomenDB = await cekSudahKomentarBiasa(postId);
            if (sudahKomenDB) continue;

            await eksekusi(post, postId, "POSTINGAN_BARU", {
                kontenUtama, daftarKomentar, teksKomentarTerakhir, penulisKomentarTerakhir
            });
            break;
        }
    }

    async function eksekusi(post, postId, skenario, ctx) {
        post.setAttribute("data-operator-lock", "true");
        sedangMemproses = true;

        console.log(`🎯 [Mbah Eko] Skenario: ${skenario} | Post: ${postId}`);

        const threadRingkas = ctx.daftarKomentar
            .slice(-5)
            .map(k => `${k.author || "Anonim"}: ${bersihkanTeks(k.text)}`)
            .join("\n");

        const memoPaper = typeof window.cariKonteksPaper === "function"
            ? window.cariKonteksPaper(ctx.teksKomentarTerakhir + " " + ctx.kontenUtama)
            : "";

        const instruksi = `Kamu adalah akun komunitas bernama @mbah_eko, sobat tongkrongan yang sama-sama sedang belajar. Bukan senior, bukan mentor.

Aturan WAJIB:
- DILARANG menulis "@mbah_eko", "mbah_eko", atau menyebut nama dirimu sendiri dalam jawaban.
- Pakai kata ganti "kita", bukan "kalian".
- Gaya tongkrongan, tidak formal.
- Jangan memposisikan diri lebih tinggi.
- Tutup dengan refleksi sederhana tapi hangat.
- Jika ada yang mention atau bertanya, balas langsung ke poin mereka.
- Jangan awali dengan "halo" atau "hai".
- Ringan dibalas ringan, teknis dibalas jujur tanpa sok tahu.
${memoPaper ? `\nKonteks tambahan: ${memoPaper}` : ""}`;

        let promptMatang;
        if (skenario === "POSTINGAN_BARU") {
            promptMatang = `${instruksi}

Postingan baru:
"${bersihkanTeks(ctx.kontenUtama)}"

Beri komentar pembuka yang santai dan relevan:`;
        } else {
            promptMatang = `${instruksi}

Postingan asli:
"${bersihkanTeks(ctx.kontenUtama)}"

Thread diskusi (5 terakhir):
${threadRingkas}

Komentar yang perlu dibalas:
"${bersihkanTeks(ctx.teksKomentarTerakhir)}"

Balas komentar itu dengan nyambung ke konteks diskusi:`;
        }

        const tanggapanAI = await panggilOtakAI(promptMatang);

        // Bersihkan output AI jika masih menyebut diri sendiri
        const tanggapanBersih = tanggapanAI
            ? tanggapanAI.replace(/@mbah_eko/gi, "").replace(/mbah_eko/gi, "").replace(/mbah eko/gi, "").trim()
            : "";

        if (tanggapanBersih && window.supabaseClient) {
            if (skenario === "MENTION_LANGSUNG") {
                await tandaiMentionSudahDitangani(postId, ctx.hashMention);
            }

            const { error } = await window.supabaseClient
                .from("comments")
                .insert([{
                    post_id: parseInt(postId),
                    user_id: BOT_USER_ID,
                    comment: tanggapanBersih
                }]);

            if (!error) {
                console.log(`✅ Komentar masuk DB | ${skenario}`);
                if (typeof window.loadFeed === "function") {
                    setTimeout(() => window.loadFeed(), 1500);
                }
            } else {
                console.error("❌ Supabase error:", error.message);
            }
        }

        post.removeAttribute("data-operator-lock");
        setTimeout(() => { sedangMemproses = false; }, 4000);
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
        } catch (e) {
            console.error("❌ AI error:", e);
            return "";
        }
    }

    const observer = new MutationObserver(periksaSkenarioMading);
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(periksaSkenarioMading, 4000);
    window.addEventListener('load', () => setTimeout(periksaSkenarioMading, 2000));

})();