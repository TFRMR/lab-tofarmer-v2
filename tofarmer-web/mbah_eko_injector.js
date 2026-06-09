(function() {
    console.log("👴 [Mbah Eko - Operator Akun] Resmi aktif sebagai pengendali akun riil...");

    const URL_RESMI = "https://tofarmer-api.tofarmer-api.workers.dev/ai-saran"; 
    const BOT_USERNAME = "@mbah_eko";
    const USER_EMAS = "CYBER_FARMER"; // Akun Mastermind Njenengan

    // =========================================================================
    // TOFARMER KNOWLEDGE BASE - BASIS PENGETAHUAN RESMI EKOSISTEM TOFARMER
    // =========================================================================
    const TOFARMER_PAPER = {
        latar_belakang_filosofi: `[FILOSOFI] Pertanian sebagai aktivitas intelektual, langkah demi langkah, menghargai kejujuran proses tumbuh dari nol, bukan hasil instan.`,
        lima_pilar: `[5 PILAR] 1. Komunitas, 2. Inovasi/Teknologi, 3. Ladang (Proof of Work), 4. Finansial (Mesin Ekonomi), 5. Refleksi Petapa.`,
        epistemologi_ilmu_baku: `[ILMU BAKU] Kesimpulan provisional terbaik dari praktik nyata berulang di lapangan yang konsisten.`,
        strategi_ekonomi_compounding: `[ECONOMY] "Nabung Receh" bangun aset tanpa utang. Compounding 5-10% aktif di angka 500 TOF (1 TOF = Rp1.000).`
    };

    function cariKonteksPaper(pertanyaan) {
        const kueri = pertanyaan.toLowerCase();
        let konteks = "";
        if (kueri.includes("filosofi") || kueri.includes("proses")) konteks += TOFARMER_PAPER.latar_belakang_filosofi + "\n";
        if (kueri.includes("pilar") || kueri.includes("teknologi")) konteks += TOFARMER_PAPER.lima_pilar + "\n";
        if (kueri.includes("ilmu") || kueri.includes("baku")) konteks += TOFARMER_PAPER.epistemologi_ilmu_baku + "\n";
        if (kueri.includes("receh") || kueri.includes("nabung")) konteks += TOFARMER_PAPER.strategi_ekonomi_compounding + "\n";
        return konteks || TOFARMER_PAPER.latar_belakang_filosofi;
    }

    let sedangMemproses = false;

    async function periksaSkenarioMading() {
        if (sedangMemproses) return;

        // Mendeteksi seluruh kartu postingan di mading
        const semuaPostingan = document.querySelectorAll("#feed-container .post, #posts .post, .post, [id^='post-card-']"); 
        if (!semuaPostingan.length) return;

        for (const post of semuaPostingan) {
            if (post.getAttribute("data-operator-lock") === "true") continue;

            // Mengambil ID postingan riil dari Supabase (biasanya tertanam di ID elemen atau atribut data)
            const postId = post.getAttribute("data-id") || post.id?.replace("post-card-", "") || post.id;
            if (!postId) continue;

            const kontenTeksUtama = post.querySelector(".text, .deskripsi-proses")?.innerText || "";
            
            // Kumpulkan semua komentar riil yang ada di dalam postingan ini
            const elemenKomentar = post.querySelectorAll("[data-comment-author], .comment-item, .comment-box p");
            let daftarKomentar = [];
            let mbahPernahKomentar = false;

            elemenKomentar.forEach((el) => {
                // Abaikan kotak AI penasihat atas
                if (el.id === 'advice-box' || el.id === 'ai-text' || el.closest('#advice-container')) return;

                const penulis = el.getAttribute("data-comment-author") || el.querySelector(".comment-author")?.innerText || "";
                const teks = (el.innerText || "").trim();
                
                if (teks === "" || teks.startsWith("Kirim") || teks.startsWith("Sruput")) return;

                if (penulis.includes("mbah_eko") || teks.includes("@mbah_eko") || teks.includes("Petapa Menoreh")) {
                    mbahPernahKomentar = true;
                }

                daftarKomentar.push({ author: penulis.replace("@", "").trim(), text: teks });
            });

            // Baca komentar paling terakhir di postingan saat ini
            const komentarTerakhir = daftarKomentar[daftarKomentar.length - 1] || null;
            const teksKomentarTerakhir = komentarTerakhir ? komentarTerakhir.text : "";
            const penulisKomentarTerakhir = komentarTerakhir ? komentarTerakhir.author : "";

            // Bikin sidik jari hash agar tidak mengeksekusi obrolan yang sama berkali-kali
            const hashKomentar = btoa(unescape(encodeURIComponent(teksKomentarTerakhir + penulisKomentarTerakhir))).substring(0, 12);

            let terpicu = false;
            let jenisSkenario = "";

            // =========================================================================
            // EVALUASI 3 GERBANG SKENARIO OPERATOR
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

                // Amankan memori pengunci lokal sebelum menembak biar tidak double post karena lag network
                if (jenisSkenario === "POSTINGAN_BARU") localStorage.setItem(`op_sapa_${postId}`, "done");
                if (jenisSkenario === "MENTION_LANGSUNG") localStorage.setItem(`op_mention_${postId}`, hashKomentar);
                if (jenisSkenario === "BALASAN_USER_EMAS") localStorage.setItem(`op_emas_${postId}`, hashKomentar);

                // Racik ramuan prompt AI
                const memoPaper = cariKonteksPaper(teksKomentarTerakhir + " " + kontenTeksUtama);
               // Koreksi ramuan prompt agar pas dengan jiwa aslinya:
let instruksi = `Kamu adalah @mbah_eko, akun sesepuh riil yang bertindak sebagai Kompas Filosofis & Penjaga Pilar Refleksi Petapa di mading ToFarmer.\nLandasan Paper:\n${memoPaper}\n`;

                if (jenisSkenario === "POSTINGAN_BARU") {
                    instruksi += `Tugas: Berikan wejangan apresiasi singkat (1-2 kalimat) atas postingan proses baru ini agar bersemangat berkarya. Gunakan sapaan halus 'Kang', 'Mbak', 'Ngger', atau 'Njenengan'.`;
                } else if (jenisSkenario === "MENTION_LANGSUNG") {
                    instruksi += `Tugas: Jawab langsung pertanyaan/omongan user yang menyebut namamu secara nyambung dan santai ala jagongan warung kopi Menoreh. Maksimal 2 kalimat.`;
                } else if (jenisSkenario === "BALASAN_USER_EMAS") {
                    instruksi += `Tugas: Hormati argumen dari Mastermind (${USER_EMAS}). Berikan tanggapan dialog intelektual yang selaras dengan visi ekosistem kita. Maksimal 2 kalimat.`;
                }

                const promptMatang = `${instruksi}\n\nKonteks Post: "${kontenTeksUtama}"\nKomentar Terakhir: "${teksKomentarTerakhir}"\n\nBalasan ringkasmu:`;

                // Ambil wejangan dari Cloudflare Worker
                const tanggapanAI = await panggilOtakAI(promptMatang);

                if (tanggapanAI && tanggapanAI.trim() !== "") {
                    console.log(`👴 [Operator] Menyetorkan komentar riil ke database via sendComment()...`);
                    
                    // 🔥 JALUR SAKTI: Membajak fungsi asli web untuk dimasukkan ke Supabase
                    if (typeof window.sendComment === "function") {
                        // Simpan sementara wallet asli yang sedang login di browser Njenengan
                        const backupWalletUtama = localStorage.getItem('tof_wallet');
                        
                        // SUNTIK IDENTITAS: Paksa browser menyamar menjadi Akun Mbah Eko selama 1 milidetik!
                        localStorage.setItem('tof_wallet', 'YUSLGKMUNQCUOWOY6YBYDSA7GYMT3BRDRCMI56XTJL7BOGLGSY67DWQCXI'); 
                        
                        // Eksekusi fungsi kirim bawaan app.js agar masuk database secara riil!
                        await window.sendComment(postId, tanggapanAI);
                        
                        // Kembalikan akun asli Njenengan seperti semula
                        if (backupWalletUtama) {
                            localStorage.setItem('tof_wallet', backupWalletUtama);
                        } else {
                            localStorage.removeItem('tof_wallet');
                        }
                        
                        console.log(`🎯 [Operator] Sukses! Komentar @mbah_eko berhasil mengudara di Supabase.`);
                    } else {
                        console.error("❌ Fungsi sendComment tidak ditemukan di app.js!");
                    }
                }

                post.removeAttribute("data-operator-lock");
                setTimeout(() => { sedangMemproses = false; }, 3000); // Jeda pengaman biar tenang
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
        } catch (e) { console.error("Gagal kontak AI:", e); }
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
        if (adaPerubahanValid) periksaSkenARIOMading();
    });

    observer.observe(targetMading, { childList: true, subtree: true });
    setTimeout(periksaSkenarioMading, 2000);
})();