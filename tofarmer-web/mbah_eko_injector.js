(function () {
    console.log("👴 [Mbah Eko] Aktif...");

    const URL_TEKS   = "https://tofarmer-api.tofarmer-api.workers.dev/ai-saran";
    const URL_GAMBAR = "https://tofarmer-api.tofarmer-api.workers.dev/ai-gambar";
    const BOT_USERNAME = "@mbah_eko";
    const BOT_USER_ID  = "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY";

    let sedangMemproses = false;
    let debounceTimer   = null;

    // ─── UTILITAS ────────────────────────────────────────────────────────

    function buatHash(str) {
        return btoa(unescape(encodeURIComponent(str))).substring(0, 16);
    }

    function adalahDiriSendiri(penulis, teks) {
        return (
            penulis.includes("mbah_eko") ||
            teks.includes("Petapa Menoreh") ||
            teks.startsWith("[MENTION_HANDLED:")
        );
    }

    function bersihkanTeks(teks) {
        return teks
            .replace(/@mbah_eko/gi, "")
            .replace(/mbah eko/gi, "")
            .replace(/Petapa Menoreh/gi, "")
            .trim();
    }

    function ambilUrlGambar(post) {
        const elGambar = post.querySelector(
            "img.post-image, .post-media img, .post-content img, " +
            ".post-foto img, img[src*='supabase'], img[src*='storage']"
        );
        if (!elGambar) return null;
        if (elGambar.naturalWidth > 0 && elGambar.naturalWidth < 120) return null;
        return elGambar.src || elGambar.getAttribute("src") || null;
    }

    // ─── BACA KONTEKS POSTINGAN ───────────────────────────────────────────

    function ambilKonteksPost(post) {
        const kontenUtama = post.querySelector(".text, .deskripsi-proses")?.innerText?.trim() || "";

        const elemenKomentar = post.querySelectorAll(
            "[data-comment-author], .comment-item, .comment-box p, .comment-text, .tof-mention"
        );

        let daftarKomentar = [];
        let mbahPernahKomentar = false;

        elemenKomentar.forEach((el) => {
            if (el.id === "advice-box" || el.id === "ai-text" || el.closest("#advice-container")) return;

            const penulis = el.getAttribute("data-comment-author")
                || el.querySelector(".comment-author")?.innerText
                || "";
            const teks = (el.innerText || "").trim();

            if (!teks || teks.startsWith("Kirim") || teks.startsWith("Sruput")) return;

            if (adalahDiriSendiri(penulis, teks)) {
                mbahPernahKomentar = true;
                return;
            }

            daftarKomentar.push({ author: penulis.replace("@", "").trim(), text: teks });
        });

        const komentarTerakhir = daftarKomentar[daftarKomentar.length - 1] || null;
        return { kontenUtama, daftarKomentar, komentarTerakhir, mbahPernahKomentar };
    }

    // ─── PENANDA MENTION — pakai localStorage, BUKAN database ────────────

    function sudahTanganiMention(hash) {
        const data = JSON.parse(localStorage.getItem("mbah_eko_handled") || "{}");
        return !!data[hash];
    }

    function tandaiMentionSelesai(hash) {
        const data = JSON.parse(localStorage.getItem("mbah_eko_handled") || "{}");
        data[hash] = Date.now();

        // Bersihkan entri lama (lebih dari 3 hari) supaya tidak menumpuk
        const batasTiga = Date.now() - 3 * 24 * 60 * 60 * 1000;
        for (const k in data) {
            if (data[k] < batasTiga) delete data[k];
        }

        localStorage.setItem("mbah_eko_handled", JSON.stringify(data));
    }

    // ─── CEK KOMENTAR BIASA DI SUPABASE ──────────────────────────────────

    async function cekSudahKomentarBiasa(postId) {
        if (!window.supabaseClient) return false;
        const { data, error } = await window.supabaseClient
            .from("comments")
            .select("id")
            .eq("post_id", parseInt(postId))
            .eq("user_id", BOT_USER_ID)
            .limit(1);
        return error ? false : data.length > 0;
    }

    // ─── MAIN LOOP ────────────────────────────────────────────────────────

    async function periksaSkenarioMading() {
        if (sedangMemproses) return;

        const semuaPostingan = document.querySelectorAll(
            "#feed .post, #userPosts .post, #profilePosts .post, .post, [id^='post-card-']"
        );
        if (!semuaPostingan.length) return;

        for (const post of semuaPostingan) {
            const postId = post.getAttribute("data-id")
                || post.id?.replace("post-card-", "")
                || post.id;

            if (!postId || post.getAttribute("data-operator-lock") === "true") continue;

            const { kontenUtama, daftarKomentar, komentarTerakhir, mbahPernahKomentar }
                = ambilKonteksPost(post);

            const teksKomentarTerakhir    = komentarTerakhir?.text   || "";
            const penulisKomentarTerakhir = komentarTerakhir?.author || "";

            if (adalahDiriSendiri(penulisKomentarTerakhir, teksKomentarTerakhir)) continue;

            // ── SKENARIO MENTION ─────────────────────────────────────────
            const adaMention = teksKomentarTerakhir.toLowerCase()
                .includes(BOT_USERNAME.toLowerCase());

            if (adaMention) {
                const hashMention = buatHash(
                    teksKomentarTerakhir + penulisKomentarTerakhir + postId
                );

                // Cek localStorage dulu (cepat, tanpa DB)
                if (sudahTanganiMention(hashMention)) continue;

                await eksekusi(post, postId, "MENTION_LANGSUNG", {
                    kontenUtama, daftarKomentar,
                    teksKomentarTerakhir, penulisKomentarTerakhir,
                    hashMention
                });
                break;
            }

            // ── SKENARIO POSTING BARU ─────────────────────────────────────
            if (mbahPernahKomentar) continue;

            const sudahKomenDB = await cekSudahKomentarBiasa(postId);
            if (sudahKomenDB) continue;

            await eksekusi(post, postId, "POSTINGAN_BARU", {
                kontenUtama, daftarKomentar,
                teksKomentarTerakhir, penulisKomentarTerakhir
            });
            break;
        }
    }

    // ─── EKSEKUSI ─────────────────────────────────────────────────────────

    async function eksekusi(post, postId, skenario, ctx) {
        post.setAttribute("data-operator-lock", "true");
        sedangMemproses = true;

        console.log(`🎯 [Mbah Eko] Skenario: ${skenario} | Post: ${postId}`);

        await new Promise(resolve => setTimeout(resolve, 1000));

        const threadRingkas = ctx.daftarKomentar
            .slice(-5)
            .map(k => `${k.author || "Anonim"}: ${bersihkanTeks(k.text)}`)
            .join("\n");

        const memoPaper = typeof window.cariKonteksPaper === "function"
            ? window.cariKonteksPaper(ctx.teksKomentarTerakhir + " " + ctx.kontenUtama)
            : "";

        const instruksi = `Kamu adalah akun komunitas bernama @mbah_eko, sahabat ngopi yang sama-sama sedang belajar. Bukan senior, bukan mentor.

Aturan WAJIB:
- DILARANG menulis "@mbah_eko", "mbah_eko", atau menyebut nama dirimu sendiri dalam jawaban.
- Pakai kata ganti "kita", bukan "kalian".
- Jangan memposisikan diri lebih tinggi.
- Jika ada yang mention atau bertanya, balas langsung ke poin mereka.
- Jawab langsung to-the-point tanpa sapaan "halo/hai".
- Ringan dibalas ringan, teknis dibalas jujur tanpa sok tahu.
- WAJIB jawab maksimal 1 kalimat santai saja!
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

        const urlGambar = ambilUrlGambar(post);
        let tanggapanAI = "";

        if (urlGambar) {
            console.log(`🖼️ [Mbah Eko] Gambar ditemukan...`);
           const urlGambar = ambilUrlGambar(post);
        let tanggapanAI = "";

        if (urlGambar) {
            console.log(`🖼️ [Mbah Eko] Gambar ditemukan...`);
            
            // Jauh lebih ringkas, melarang analisis objek, langsung memberikan konteks sekilas
            const promptDenganGambar = `${promptMatang}
            
[Konteks Penting: Postingan ini menyertakan gambar. JANGAN menganalisis objek di gambar. Fokus penuh pada teks di atas. Cukup sisipkan 1 frasa santai yang relevan di dalam kalimat obrolanmu jika diperlukan (misal: "sambil ngopi", "lihat suasananya", atau "mantap itu fotonya"). Jawab langsung tanpa berbelit-belit!]`;

            tanggapanAI = await panggilAIdenganGambar(promptDenganGambar, urlGambar);
            if (!tanggapanAI) {
                console.warn("⚠️ Gambar gagal, fallback ke teks...");
                tanggapanAI = await panggilAIteks(promptMatang);
            }
        } else {
            tanggapanAI = await panggilAIteks(promptMatang);
        }
            

        const tanggapanBersih = tanggapanAI
            ? tanggapanAI
                .replace(/@mbah_eko/gi, "")
                .replace(/mbah_eko/gi, "")
                .replace(/mbah eko/gi, "")
                .trim()
            : "";

        if (tanggapanBersih && window.supabaseClient) {
            // Untuk MENTION: tandai di localStorage SEBELUM insert
            if (skenario === "MENTION_LANGSUNG") {
                tandaiMentionSelesai(ctx.hashMention);
            }

            const { error } = await window.supabaseClient
                .from("comments")
                .insert([{
                    post_id: parseInt(postId),
                    user_id: BOT_USER_ID,
                    comment: tanggapanBersih
                }]);

            if (!error) {
                console.log(`✅ Komentar masuk | ${skenario}${urlGambar ? " + gambar" : ""}`);
                if (typeof window.loadFeed === "function") {
                    setTimeout(() => window.loadFeed(), 1500);
                }
            } else {
                console.error("❌ Supabase error:", error.message);
            }
        }

        post.removeAttribute("data-operator-lock");
        setTimeout(() => { sedangMemproses = false; }, 8000); // cooldown 8 detik
    }

    // ─── PANGGIL WORKER: TEKS ─────────────────────────────────────────────

    async function panggilAIteks(promptTeks) {
        try {
            const res = await fetch(URL_TEKS, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: promptTeks, teks: promptTeks })
            });
            const json = await res.json();
            return json.reply || json.saran || "";
        } catch (e) {
            console.error("❌ AI teks error:", e);
            return "";
        }
    }

// ─── PANGGIL WORKER: GAMBAR (DENGAN DOWN-SCALE / KOMPRESI LOGIS) ──────

    async function panggilAIdenganGambar(promptTeks, imageUrl) {
        try {
            // 1. Ambil gambar asli
            const img = new Image();
            img.crossOrigin = "anonymous"; // Hindari isu CORS mading
            
            const p = new Promise((resolve, reject) => {
                img.onload = () => resolve(img);
                img.onerror = (e) => reject(e);
                img.src = imageUrl;
            });
            await p;

           // 2. Down-scale gambar menggunakan Canvas (Dioptimalkan ke 800px agar detail tidak hilang)
const canvas = document.createElement("canvas");
const ctxCanvas = canvas.getContext("2d");

let width = img.width;
let height = img.height;
const max_size = 800; // Naik ke 800px agar model tidak 'kebingungan' melihat objek buram

if (width > height) {
    if (width > max_size) {
        height *= max_size / width;
        width = max_size;
    }
} else {
    if (height > max_size) {
        width *= max_size / height;
        height = max_size;
    }
}

canvas.width = width;
canvas.height = height;
ctxCanvas.drawImage(img, 0, 0, width, height);

// 3. Ubah menjadi JPEG dengan kualitas 0.7 (70%)
const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.7));
const arrayBuffer = await blob.arrayBuffer();
const byteArray = Array.from(new Uint8Array(arrayBuffer));

            // 4. Kirim ke Worker dengan payload ukuran minimalis (~20-50 KB saja)
            const res = await fetch(URL_GAMBAR, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    prompt: promptTeks, 
                    image: byteArray 
                })
            });
            
            if (!res.ok) {
                const errData = await res.json();
                console.error("Worker menolak gambar:", errData);
                return "";
            }

            const json = await res.json();
            return json.response || json.saran || "";
        } catch (e) {
            console.error("❌ AI gambar error di injector:", e);
            return "";
        }
    }

    // ─── OBSERVER + PEMICU (dengan debounce 8 detik) ─────────────────────

    function jadwalkanPemeriksa() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(periksaSkenarioMading, 8000);
    }

    const observer = new MutationObserver(jadwalkanPemeriksa);
    observer.observe(document.body, { childList: true, subtree: true });

    // Cek awal setelah halaman siap
    setTimeout(periksaSkenarioMading, 5000);
    window.addEventListener("load", () => setTimeout(periksaSkenarioMading, 3000));

})();