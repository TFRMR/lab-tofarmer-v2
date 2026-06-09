(function() {
    console.log("👴 [Mbah Eko - Operator Akun] Versi Otak Terintegrasi & Akun Riil Aktif...");

    const URL_RESMI = "https://tofarmer-api.tofarmer-api.workers.dev/ai-saran"; 
    const BOT_USERNAME = "@mbah_eko";
    
    // Konfigurasi Akun & Dompet Resmi dari Njenengan
    const WALLET_ASLI_MBAH = "YUSLGKMUNQCUOWOY6YBYDSA7GYMT3BRDRCMI56XTJL7BOGLGSY67DWQCXI";
    const USER_EMAS = "CYBER_FARMER"; 

    let sedangMemproses = false;

    async function periksaSkenarioMading() {
        if (sedangMemproses) return;

        // Mendeteksi seluruh kartu postingan di mading feed ToFarmer
        const semuaPostingan = document.querySelectorAll("#feed-container .post, #posts .post, .post, [id^='post-card-']"); 
        if (!semuaPostingan.length) return;

        for (const post of semuaPostingan) {
            if (post.getAttribute("data-operator-lock") === "true") continue;

            // Mengambil ID postingan riil dari Supabase (id elemen atau data-id)
            const postId = post.getAttribute("data-id") || post.id?.replace("post-card-", "") || post.id;
            if (!postId) continue;

            const kontenTeksUtama = post.querySelector(".text, .deskripsi-proses")?.innerText || "";
            const elemenKomentar = post.querySelectorAll("[data-comment-author], .comment-item, .comment-box p, .comment-text");
            
            let daftarKomentar = [];
            let mbahPernahKomentar = false;

            // Kumpulkan semua daftar komentar yang ada di dalam card post saat ini
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

            // Ambil data komentar paling terakhir di postingan ini
            const komentarTerakhir = daftarKomentar[daftarKomentar.length - 1] || null;
            const teksKomentarTerakhir = komentarTerakhir ? komentarTerakhir.text : "";
            const penulisKomentarTerakhir = komentarTerakhir ? komentarTerakhir.author : "";

            // Sidik jari hash pengaman agar tidak berulang mengeksekusi komentar yang sama
            const hashKomentar = btoa(unescape(encodeURIComponent(teksKomentarTerakhir + penulisKomentarTerakhir))).substring(0, 12);

            let terpicu = false;
            let jenisSkenario = "";

            // =========================================================================
            // EVALUASI EVALUASI 3 GERBANG SKENARIO OPERATOR
            // =========================================================================

            // GERBANG 1: Postingan Baru & Mbah Belum Pernah Nimbrung Sama Sekali
            if (!mbahPernahKomentar && !localStorage.getItem(`op_sapa_${postId}`)) {
                terpicu = true;
                jenisSkenario = "POSTINGAN_BARU";
            }
            // GERBANG 2: Ada Anggota Menyebut/Mentions @mbah_eko di Komentar Terakhir
            else if (teksKomentarTerakhir.toLowerCase().includes(BOT_USERNAME.toLowerCase())) {
                if (localStorage.getItem(`op_mention_${postId}`) !== hashKomentar) {
                    terpicu = true;
                    jenisSkenario = "MENTION_LANGSUNG";
                }
            }
            // GERBANG 3: User Emas (Mastermind) Membalas Komentar Terakhir si Mbah
            else if (mbahPernahKomentar && penulisKomentarTerakhir === USER_EMAS) {
                if (localStorage.getItem(`op_emas_${postId}`) !== hashKomentar) {
                    terpicu = true;
                    jenisSkenario = "BALASAN_USER_EMAS";
                }
            }

            // EKSEKUSI JIKA GERBANG TERPICU
            if (terpicu) {
                post.setAttribute("data-operator-lock", "true");
                sedangMemproses = true;

                console.log(`🚀 [Operator] Skenario [${jenisSkenario}] Terdeteksi pada Post ID: ${postId}`);

                if (jenisSkenario === "POSTINGAN_BARU") localStorage.setItem(`op_sapa_${postId}`, "done");
                if (jenisSkenario === "MENTION_LANGSUNG") localStorage.setItem(`op_mention_${postId}`, hashKomentar);
                if (jenisSkenario === "BALASAN_USER_EMAS") localStorage.setItem(`op_emas_${postId}`, hashKomentar);

                // 🔥 TAKTIK JEMBATAN GAIB: Ambil ingatan langsung dari knowledge-base.js yang aktif di web browser
                let memoPaper = "";
                if (typeof window.cariKonteksPaper === "function") {
                    memoPaper = window.cariKonteksPaper(teksKomentarTerakhir + " " + kontenTeksUtama);
                } else if (typeof cariKonteksPaper === "function") {
                    memoPaper = cariKonteksPaper(teksKomentarTerakhir + " " + kontenTeksUtama);
                } else {
                    memoPaper = "Pertanian sebagai aktivitas intelektual, rekam jejak, jujur berproses, dan refleksi mendalam.";
                }
                
                let instruksi = `Kamu adalah @mbah_eko, akun sesepuh riil yang bertindak sebagai Kompas Filosofis & Penjaga Pilar Refleksi Petapa di mading ToFarmer.\nLandasan Paper:\n${memoPaper}\n`;

                if (jenisSkenario === "POSTINGAN_BARU") {
                    instruksi += `Tugas: Berikan petuah bijak singkat (1-2 kalimat) yang mengapresiasi langkah proses nyata atau awal karya mereka. Gunakan sapaan akrab khas desa seperti 'Ngger', 'Kang', 'Mbak', atau 'Njenengan'.`;
                } else if (jenisSkenario === "MENTION_LANGSUNG") {
                    instruksi += `Tugas: Jawab jagongan/pertanyaan dari user yang memanggil namamu secara nyambung, mengalir santai, dan penuh kearifan lereng Menoreh. Maksimal 2 kalimat.`;
                } else if (jenisSkenario === "BALASAN_USER_EMAS") {
                    instruksi += `Tugas: Hormati dan sambung argumen pemikiran dari Mastermind (${USER_EMAS}) ini demi kawalan visi jangka panjang ekosistem kita. Maksimal 2 kalimat.`;
                }

                const promptMatang = `${instruksi}\n\nKonieks Post: "${kontenTeksUtama}"\nKomentar Terakhir: "${teksKomentarTerakhir}"\n\nBalasan ringkasmu:`;

                // Ambil wejangan dari Cloudflare Worker
                const tanggapanAI = await panggilOtakAI(promptMatang);

                if (tanggapanAI && tanggapanAI.trim() !== "") {
                    console.log(`👴 [Operator] Menyetorkan komentar riil ke database via sendComment()...`);
                    
                    if (typeof window.sendComment === "function") {
                        // Simpan sementara wallet asli yang sedang Njenengan pakai di browser
                        const backupWalletUtama = localStorage.getItem('tof_wallet');
                        
                        // SUNTIK IDENTITAS: Paksa browser menyamar jadi Dompet Mbah Eko dalam sekejap!
                        localStorage.setItem('tof_wallet', WALLET_ASLI_MBAH); 
                        
                        try {
                            // Eksekusi fungsi kirim bawaan app.js agar masuk database secara riil
                            await window.sendComment(postId, tanggapanAI);
                            console.log(`🎯 [Operator] Perintah kirim dieksekusi untuk Post ID: ${postId}`);
                        } catch (err) {
                            console.error("❌ Gagal saat mengeksekusi sendComment bawaan web:", err);
                        }

                        // Beri jeda aman 800 milidetik biar query Supabase kelar, lalu kembalikan login akun Njenengan
                        setTimeout(() => {
                            if (backupWalletUtama) {
                                localStorage.setItem('tof_wallet', backupWalletUtama);
                            } else {
                                localStorage.removeItem('tof_wallet');
                            }
                            console.log(`🔒 [Operator] Penyamaran selesai. Login dikembalikan aman ke akun utama.`);
                        }, 800);

                    } else {
                        console.error("❌ Fungsi sendComment tidak ditemukan di app.js!");
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
            if (res.ok) {
                const contentType = res.headers.get("content-type") || "";
                if (contentType.includes("application/json")) {
                    const json = await res.json();
                    return json.saran || json.reply || json.text || "";
                }
                return await res.text();
            }
        } catch (e) { console.error("Gagal kontak AI Worker:", e); }
        return "";
    }

    // Pemantau aktivitas perubahan mading feed secara real-time
    const targetMading = document.getElementById("feed") || document.getElementById("feed-container") || document.body;
    const observer = new MutationObserver((mutations) => {
        let adaPerubahanValid = false;
        for (let m of mutations) {
            if (m.type === 'childList' && m.addedNodes.length > 0) {
                const cekKotakAtas = Array.from(m.addedNodes).some(node => 
                    node.nodeType === 1 && (node.id === 'advice-box' || node.id === 'ai-text' || node.closest('#advice-container'))
                );
                if (!cekKotakAtas) { adaPerubahanValid = true; break; }
            }
        }
        if (adaPerubahanValid) periksaSkenarioMading();
    });

    observer.observe(targetMading, { childList: true, subtree: true });
    setTimeout(periksaSkenarioMading, 4000);
})();