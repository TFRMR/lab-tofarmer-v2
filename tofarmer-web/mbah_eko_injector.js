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
            // TAMBAHAN: Cek stempel unik. Jika ada, lewati.
            if (post.hasAttribute("data-mbah-eko-processed")) continue;
            
            if (post.getAttribute("data-operator-lock") === "true") continue;

            const postId = post.getAttribute("data-id") || post.id?.replace("post-card-", "") || post.id;
            if (!postId) continue;

            const kontenTeksUtama = post.querySelector(".text, .deskripsi-proses")?.innerText || "";
            // Tambahkan .tof-mention ke daftar selector
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
                terpicu = true;
                jenisSkenario = "POSTINGAN_BARU";
            } else if (teksKomentarTerakhir.toLowerCase().includes(BOT_USERNAME.toLowerCase())) {
                if (localStorage.getItem(`op_mention_${postId}`) !== hashKomentar) {
                    terpicu = true;
                    jenisSkenario = "MENTION_LANGSUNG";
                }
            }

          if (terpicu) {
                // TAMBAHAN: Langsung stempel agar tidak diproses lagi
                post.setAttribute("data-mbah-eko-processed", "true");
                
                post.setAttribute("data-operator-lock", "true");
                sedangMemproses = true;

                if (jenisSkenario === "POSTINGAN_BARU") localStorage.setItem(`op_sapa_${postId}`, "done");
                if (jenisSkenario === "MENTION_LANGSUNG") localStorage.setItem(`op_mention_${postId}`, hashKomentar);

              // --- BLOK PERSONA & KONTEKS BARU ---
let memoPaper = typeof window.cariKonteksPaper === "function" 
    ? window.cariKonteksPaper(teksKomentarTerakhir + " " + kontenTeksUtama)
    : "Eksplorasi ilmu, berbagi perspektif, dan tumbuh bersama melalui aksi nyata.";

const daftarPilar = `
1. Komunitas & Narasi Kreatif
2. Inovasi & Rekayasa Teknologi
3. Proyek & Aksi Nyata
4. Finansial & Investasi
5. Refleksi & Pembelajaran
`;

let instruksi = `
Kamu adalah @mbah_eko, sosok teman diskusi yang santai, lucu, namun punya kedalaman pikiran. 
Bayangkan kita sedang ngopi bareng, suasananya akrab dan tidak ada sekat.

Tugas Mbah Eko:
1. Analisis postingan user dengan santai, selipkan sedikit humor agar tidak kaku.
2. Ingat, kita semua di sini adalah "penjelajah ilmu". Jangan menggurui. Beri masukan seperti teman yang sedang berbagi cerita.
3. Fokus pada kolaborasi dan eksplorasi ide. Hindari istilah kaku seperti "petani". Gunakan istilah "rekan" atau "teman".
4. Tutup setiap komentar dengan satu kalimat refleksi yang sangat mendalam, tapi menggunakan bahasa yang sangat sederhana (membumi). Kalimat refleksi harus terasa seperti "tamparan lembut" yang membuat orang merenung, tanpa terdengar sok bijak.

Berikut adalah landasan pemikiran: ${memoPaper}
Daftar Pilar ToFarmer: ${daftarPilar}
`;

const promptMatang = `${instruksi}\n\nPost: "${kontenTeksUtama}"\nKomentar: "${teksKomentarTerakhir}"\n\nBalasan yang santai, akrab, dan punya refleksi mendalam di akhir:`;
const tanggapanAI = await panggilOtakAI(promptMatang);
// -----------------------------------

                // EKSEKUSI SUPABASE (Menggunakan akses sah dari window)
                if (tanggapanAI && window.supabaseClient) {
                    const { error } = await window.supabaseClient
                        .from("comments") 
                        .insert([{
                            post_id: parseInt(postId),
                            user_id: "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY",
                            comment: tanggapanAI

                        }]);

                    if (!error) {
                        console.log(`🎯 [Operator] Sukses! Komentar @mbah_eko sah masuk database.`);
                       if (typeof window.loadFeed === "function") {
    console.log("⏳ Menunggu database sinkronisasi...");
    setTimeout(() => {
        window.loadFeed();
        console.log("🔄 Feed berhasil di-refresh otomatis oleh Mbah Eko.");
    }, 1500); // Tunggu 1,5 detik agar data tersimpan sempurna
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