(function() {
    console.log("👴 [Mbah Eko - Operator Akun] Jalur Tembak Langsung Supabase + Otak Google AI Aktif...");

    const BOT_USERNAME = "@mbah_eko";
    let sedangMemproses = false;

    async function periksaSkenarioMading() {
        if (sedangMemproses) return;

        // Mengambil semua elemen postingan di mading ToFarmer
        const semuaPostingan = document.querySelectorAll("#feed .post, #userPosts .post, .post, #profilePosts .post, [id^='post-card-']");
        if (!semuaPostingan.length) return;

        for (const post of semuaPostingan) {
            const postId = post.getAttribute("data-id") || post.id?.replace("post-card-", "") || post.id;
            if (!postId) continue;

            // --- CEK KE DATABASE SUPABASE (Mencegah Double Komen) ---
            const sudahKomen = await cekApakahSudahKomentar(postId);
            if (sudahKomen) continue;

            if (post.getAttribute("data-operator-lock") === "true") continue;

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

                // --- PROSES MERAKIT QUERY BERDASARKAN KONTEKS ---
                let bahanPertanyaan = teksKomentarTerakhir || kontenTeksUtama;
                let queryMatang = bahanPertanyaan + " solusi cara mengatasi pencegahan";
                console.log(`🧠 [Mbah Eko] Merakit query untuk Google: "${queryMatang}"`);

                // --- MEMANGGIL OTAK GOOGLE AI (MENCULIK 1 KALIMAT) ---
                const tanggapanAI = await panggilOtakGoogleAI(queryMatang);
                // ----------------------------------------------------

                // EKSEKUSI SUPABASE (Kirim jawaban ke mading ToFarmer)
                if (tanggapanAI && window.supabaseClient) {
                    const { error } = await window.supabaseClient
                        .from("comments") 
                        .insert([{
                            post_id: parseInt(postId),
                            user_id: "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY",
                            comment: tanggapanAI
                        }]);

                    if (!error) {
                        console.log(`🎯 [Operator] Sukses! Komentar @mbah_eko hasil culik Google AI sah masuk database.`);
                        if (typeof window.loadFeed === "function") {
                            setTimeout(() => {
                                window.loadFeed();
                                console.log("🔄 Feed berhasil di-refresh otomatis oleh Mbah Eko.");
                            }, 1500);
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

    // 🔥 --- INI DIA FUNGSI OTAK BARU: COLO_KUTIP GOOGLE AI ---
    function panggilOtakGoogleAI(promptTeks) {
        return new Promise((resolve) => {
            console.log("🚀 Mbah Eko sedang membuka tab Google senyap...");
            let urlGoogle = "https://www.google.com/search?q=" + encodeURIComponent(promptTeks);
            
            // Membuka tab baru latar belakang
            let tabGoogle = window.open(urlGoogle, '_blank');

            // Beri waktu jeda 4,5 detik agar render AI Google selesai di tab itu
            setTimeout(() => {
                try {
                    let docGoogle = tabGoogle.document;
                    let kotakAI = docGoogle.querySelector('div[data-answer-has-content="true"]') || 
                                  docGoogle.querySelector('div[data-asoch-targets]') ||
                                  docGoogle.querySelector('.wDYXGb');

                    let teksMentah = "";
                    if (kotakAI) {
                        teksMentah = kotakAI.innerText;
                    } else {
                        // Taktik cadangan karakteristik teks
                        let semuaDiv = docGoogle.querySelectorAll('div');
                        for (let div of semuaDiv) {
                            if (div.innerText && div.innerText.length > 250 && div.innerText.includes('AI')) {
                                let rect = div.getBoundingClientRect();
                                if (rect.top > 0 && rect.top < 400) {
                                    teksMentah = div.innerText;
                                    break;
                                }
                            }
                        }
                    }

                    if (teksMentah.length > 50) {
                        // Pembersihan teks menu navigasi
                        let teksBersih = teksMentah.replace(/Semua|Video singkat|Gambar|Shopping|Video|Berita|Lainnya|Alat|Hasil Telusur|Ringkasan AI/g, "").trim();
                        let kumpulanKalimat = teksBersih.split(".");
                        let kalimatUtama = "";

                        // Isolasi hanya 1 kalimat berbobot pertama
                        for (let kalimat of kumpulanKalimat) {
                            if (kalimat.trim().length > 30) {
                                kalimatUtama = kalimat.trim() + ".";
                                break;
                            }
                        }

                        tabGoogle.close(); // Tutup tab Google biar hemat RAM
                        resolve(kalimatUtama); // Kembalikan kalimat matang
                    } else {
                        tabGoogle.close();
                        resolve("Waduh, belum ketemu jawabannya nih, coba kita sruput kopi dulu sebentar.");
                    }
                } catch (err) {
                    console.error("Gagal membaca dokumen tab Google akibat aturan CORS:", err);
                    tabGoogle.close();
                    resolve("Aduh, jaringan madingnya agak mbulet jalurnya, coba lagi nanti.");
                }
            }, 4500);
        });
    }

    // --- PENGATURAN OBSERVER MADING ---
    const observer = new MutationObserver(periksaSkenarioMading);
    observer.observe(document.body, { childList: true, subtree: true });
    
    setTimeout(periksaSkenarioMading, 4000); 

    window.addEventListener('load', () => {
        setTimeout(periksaSkenarioMading, 2000); 
    });
})();