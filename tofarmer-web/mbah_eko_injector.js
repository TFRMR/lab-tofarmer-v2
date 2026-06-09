(function() {
    console.log("👴 [Mbah Eko] Skrip injector resmi aktif & mulai mengintai feed...");

    // Menggunakan API utama yang terbukti ON di web bawaan app.js
    const URL_RESMI = "https://tofarmer-api.tofarmer-api.workers.dev/ai-saran"; 
    const BOT_USERNAME = "@mbah_eko";

    // =========================================================================
    // TOFARMER KNOWLEDGE BASE - BASIS PENGETAHUAN RESMI EKOSISTEM TOFARMER
    // Sumber: Dokumentasi Paper "Menanam Pengetahuan, Menuai Kemandirian"
    // =========================================================================
    const TOFARMER_PAPER = {
        latar_belakang_filosofi: `
[BAB 1: LATAR BELAKANG & FILOSOFI TOFARMER]
- Pertanian konvensional saat ini rapuh, identik dengan kerja otot, kelelahan fisik, dan ilmu yang sering menguap/hilang saat petani senior tiada.
- ToFarmer lahir untuk mendefinisikan ulang pertanian sebagai aktivitas intelektual, ekologis, dan ruang belajar kolektif. Setiap jengkal tanah adalah laboratorium, setiap petani adalah peneliti.
- Filosofi utama: "Langkah demi Langkah, blok demi blok". ToFarmer menghargai kejujuran proses, rekam jejak tumbuh kembang dari nol, serta pengulangan, pengalaman, dan refleksi mendalam, bukan hasil instan.
- Sistem mengutamakan kearifan lokal (gotong royong) yang digandeng dengan memori digital dan teknologi open-source untuk menjaga sejarah perjuangan petani agar tidak hilang ditelan zaman.
        `.trim(),

        lima_pilar: `
[BAB 2: LIMA PILAR FONDASI EKOSISTEM (STRUKTUR SATU TUBUH)]
ToFarmer mengadopsi semangat desentralisasi (Open Source/Linux/Blockchain) yang bergerak transparan melalui 5 Pilar Aksi yang saling mengunci:
1. Pilar 1 - Komunitas & Narasi Kreatif: Ruh gerakan, menjaga keharmonisan anggota, membangun jaringan, mendokumentasikan perjuangan tanah agar bertani dipandang keren dan terhormat.
2. Pilar 2 - Inovasi & Rekayasa Teknologi: Tempat para pengulik (tinkerer) menciptakan solusi fisik, mekanisasi tepat guna, robotika, pemrograman software, dan kecerdasan buatan (AI) untuk efisiensi kerja.
3. Pilar 3 - Ladang (Proof of Work): Tempat pengujian nyata atas teknologi dan gagasan langsung di atas tanah. Laboratorium hidup pembentuk "Ilmu Baku".
4. Pilar 4 - Finansial & Investasi (Mesin Ekonomi): Pengelola modal ekosistem untuk instrumen investasi cerdas guna memberikan "napas panjang" dan kemakmuran jangka panjang bagi komunitas.
5. Pilar 5 - Refleksi Petapa (Kompas Kemanusiaan): Pusat kendali filosofis, menjaga agar gerakan tetap jujur, menghormati alam, dan tidak berubah menjadi mesin industri dingin yang eksploitatif.
        `.trim(),

        aturan_main_fase: `
[BAB 3: ATURAN MAIN & ALUR KETERLIBATAN ANGGOTA]
Keterlibatan di ToFarmer terbagi menjadi saringan organik 3 fase:
1. Fase Obrolan (Pintu Masuk): Diskusi santai tanpa beban kerja demi menyamakan visi dan mengenalkan gaya hidup ToFarmer.
2. Fase Aksi (Partisipasi Nyata): Pembuktian niat melalui kontribusi ide, tenaga, atau dokumentasi nyata di salah satu dari 5 Pilar.
3. Fase Integrasi (Bagian Sistem): Masuk dalam siklus operasional formal secara penuh, mematuhi etika, serta menguasai Ilmu Baku dan sistem ekonomi komunitas.
        `.trim(),

        epistemologi_ilmu_baku: `
[BAB 4: EPISTEMOLOGI DAN VALIDASI ILMU BAKU]
- Hakikat Ilmu Baku: Bukan kebenaran mutlak, melainkan kesimpulan provisional (sementara) terbaik saat ini berdasarkan praktik nyata berulang dengan hasil konsisten. Bisa direvisi jika ditemukan rumus baru yang lebih efektif.
- Proses Validasi: Dari Ladang ditulis ke Database melalui 4 unsur disiplin: Pencatatan Konteks (lingkungan/waktu), Pencatatan Proses (langkah nyata), Pencatatan Hasil (efek sukses/gagal), dan Refleksi intelektual.
- Tingkat Kematangan: Catatan Praktik (eksperimen awal) -> Rujukan Operasional (panduan kerja sementara karena pola stabil) -> Ilmu Baku (standar rujukan tertinggi yang teruji konsisten).
- Nilai Kegagalan: Laporan kegagalan yang jujur bernilai ilmiah sangat tinggi agar komunitas tidak mengulangi jalan buntu yang sama. Data rekayasa/manipulatif dilarang keras!
        `.trim(),

        strategi_ekonomi_compounding: `
[BAB 5: BLUEPRINT EKONOMI, "NABUNG RECEH" & COMPOUNDING]
- Filosofi "Nabung Receh": Mengumpulkan aset sedikit demi sedikit dari aktivitas interaksi di Titik Kumpul (Mading) demi membangun modal "Uang Dingin" tanpa beban utang atau tekanan hidup.
- Konversi Aset: Setiap interaksi dikonversi menjadi unit TOF, di mana 1 TOF = Rp1.000.
- Target Tangga Kemandirian: Fase 1 (100 TOF - Lulus), Fase 2 (500 TOF - Lulus), Fase 3 (1000 TOF - Target Saat Ini), dan seterusnya (3K, 10K, 30K, hingga 100K TOF).
- Mesin Compounding: Saklar otomatis aktif tepat saat aset kolektif menyentuh angka 500 TOF. Target bunga berbunga (compounding) 5% - 10% per bulan melalui investasi/usaha yang disepakati bersama.
- Tujuan Akhir: Mencapai stabilitas finansial untuk menghasilkan "Gaji Otomatis" bagi program idealis komunitas dan pendapatan pasif anggota.
        `.trim(),

        protokol_xp_level_exit: `
[BAB 6: PROTOKOL XP, LEVEL INTELEKTUAL, DAN KETENTUAN EXIT]
Mekanisme Perolehan XP (Proof of Work):
- Bikin ilmu baku (+100 XP) | Aktif di Web & Dashboard (+20 XP) | Sapa & Diskusi Nilai (5-15 XP) | Gagasan & Validasi Ilmu (+50 XP) | Dokumentasi Praktik Ladang (+25 XP) | Narasi Intelektual/Vlog (+50 XP) | Kontribusi Modal Aset (+30 XP). Setiap akumulasi 100 XP otomatis naik Level.
Tangga Pangkat Level Intelektual:
1. GROWER (Level 1-10): Tahap belajar mendasar dan menyerap nilai.
2. PRO (Level 11-30): Tahap kontribusi & mulai menemukan pola rujukan operasional.
3. SPECIALIST (Level 31-90): Kontributor utama pembuat khazanah Pengetahuan/Ilmu Baku.
4. ELITE (Level 91-99): Tahap Mastermind/Petapa penjaga visi jangka panjang.
Skema Batas Penarikan (SBP) Token TOF:
- Level 1-10 (Hak tarik maksimal 10% saldo), Level 11-30 (Hak tarik 20% - 30%), Level 91-99 (Hak tarik penuh 100%).
Ketentuan Exit Komunitas:
- Pengambilan seluruh aset 100% (Exit) berarti keluar total dari sirkulasi manfaat komunitas. Kesempatan bergabung kembali dibatasi maksimal 3 kali.
        `.trim()
    };

    /**
     * Fungsi cerdas pencari potongan bab paper berdasarkan kedekatan kata kunci (RAG)
     */
    function cariKonteksPaper(pertanyaan) {
        const kueri = pertanyaan.toLowerCase();
        let konteksDitemukan = "";

        if (kueri.includes("filosofi") || kueri.includes("latar belakang") || kueri.includes("sejarah") || kueri.includes("tujuan") || kueri.includes("berproses") || kueri.includes("mengapa")) {
            konteksDitemukan += TOFARMER_PAPER.latar_belakang_filosofi + "\n\n";
        }
        if (kueri.includes("pilar") || kueri.includes("aksi") || kueri.includes("rekayasa") || kueri.includes("teknologi") || kueri.includes("komunitas") || kueri.includes("ladang belajar") || kueri.includes("petapa") || kueri.includes("finansial")) {
            konteksDitemukan += TOFARMER_PAPER.lima_pilar + "\n\n";
        }
        if (kueri.includes("fase") || kueri.includes("alur") || kueri.includes("obrolan") || kueri.includes("integrasi") || kueri.includes("cara masuk") || kueri.includes("gabung")) {
            konteksDitemukan += TOFARMER_PAPER.aturan_main_fase + "\n\n";
        }
        if (kueri.includes("ilmu") || kueri.includes("baku") || kueri.includes("validasi") || kueri.includes("gagal") || kueri.includes("catatan") || kueri.includes("database") || kueri.includes("rujukan")) {
            konteksDitemukan += TOFARMER_PAPER.epistemologi_ilmu_baku + "\n\n";
        }
        if (kueri.includes("receh") || kueri.includes("nabung") || kueri.includes("compounding") || kueri.includes("aset") || kueri.includes("gaji") || kueri.includes("rupiah") || kueri.includes("bunga") || kueri.includes("investasi")) {
            konteksDitemukan += TOFARMER_PAPER.strategi_ekonomi_compounding + "\n\n";
        }
        if (kueri.includes("xp") || kueri.includes("level") || kueri.includes("pangkat") || kueri.includes("grower") || kueri.includes("specialist") || kueri.includes("elite") || kueri.includes("tarik") || kueri.includes("exit") || kueri.includes("keluar") || kueri.includes("sbp")) {
            konteksDitemukan += TOFARMER_PAPER.protokol_xp_level_exit + "\n\n";
        }

        if (konteksDitemukan === "") {
            konteksDitemukan = TOFARMER_PAPER.latar_belakang_filosofi + "\n\n" + TOFARMER_PAPER.lima_pilar;
        }

        return konteksDitemukan;
    }

    let sedangMemprosesKomentar = false;

    async function periksaDanSapaFeed() {
        if (sedangMemprosesKomentar) return;

        // Memindai seluruh kartu postingan yang muncul di halaman
        const semuaPostingan = document.querySelectorAll("#feed-container .post, #posts .post, .post, [id^='post-card-']"); 
        if (!semuaPostingan.length) return;

        for (const post of semuaPostingan) {
            if (post.getAttribute("data-mbah-lock") === "true") continue;

            let jumlahBalasanMbah = parseInt(post.getAttribute("data-mbah-counter") || "0");
            if (jumlahBalasanMbah >= 3) continue; 

            const kontenTeksUtama = post.querySelector(".text, .deskripsi-proses")?.innerText || "";
            const seluruhBalonTeks = post.querySelectorAll("p, span, div");
            
            let mbahSudahPernahKomentar = false;
            let teksKomentarTerakhirUser = "";

            seluruhBalonTeks.forEach((elemen) => {
                // SENSOR RADAR: Sembunyikan pergerakan otomatis widget advice atas dari jangkauan mata si Mbah
                if (elemen.id === 'advice-box' || elemen.id === 'ai-text' || elemen.closest('#advice-container') || elemen.closest('.advice')) return;
                if (elemen.tagName === "INPUT" || elemen.tagName === "TEXTAREA" || elemen.classList.contains("comment-input") || elemen.closest(".comment-form")) return;
                
                const teksMentah = elemen.innerText || "";
                
                if (teksMentah.includes("Petapa Menoreh") || elemen.getAttribute("data-comment-author") === BOT_USERNAME) {
                    mbahSudahPernahKomentar = true;
                }

                // LINK AKUN: Mengubah teks kasaran @username jadi tautan dinamis
                if (teksMentah.includes("@") && !elemen.querySelector("a") && elemen.children.length === 0) {
                    const htmlAsli = elemen.innerHTML;
                    const htmlBaru = htmlAsli.replace(/@([a-zA-Z0-9_]+)/g, function(match, username) {
                        return `<a href="profile.html?user=${username}" style="color: #2f6f4e; font-weight: 600; text-decoration: none; border-bottom: 1px dashed #2f6f4e;">@${username}</a>`;
                    });
                    if (htmlAsli !== htmlBaru) elemen.innerHTML = htmlBaru;
                }

                if (teksMentah.trim() !== "" && !teksMentah.includes("Petapa Menoreh") && elemen.getAttribute("data-comment-author") !== BOT_USERNAME && !teksMentah.includes("Komentar") && !teksMentah.includes("Sruput")) {
                    if (teksMentah.trim() !== "Kirim" && teksMentah.trim() !== "Komentar") {
                        teksKomentarTerakhirUser = teksMentah;
                    }
                }
            });

            let lolosGerbang = false;
            let bahanTulisanAI = kontenTeksUtama;

            // Logika Sapaan: Mbah hanya membalas jika namanya dipanggil di komentar terakhir
            if (teksKomentarTerakhirUser.toLowerCase().includes(BOT_USERNAME.toLowerCase())) {
                const hashObrolan = btoa(unescape(encodeURIComponent(teksKomentarTerakhirUser))).substring(0, 12);
                
                if (post.getAttribute("data-mbah-mention-read") !== hashObrolan) {
                    console.log(`👴 [Mbah Eko] Mendengar jagongan baru di komentar: "${teksKomentarTerakhirUser}"`);
                    lolosGerbang = true;
                    
                    // Ambil isi dokumen resmi ToFarmer Paper lewat sistem pencari RAG lokal
                    const memoToFarmer = cariKonteksPaper(teksKomentarTerakhirUser + " " + kontenTeksUtama);

                    // Bentuk bungkusan instruksi karakter si Mbah
                    bahanTulisanAI = `Kamu adalah @mbah_eko, sesepuh digital ToFarmer sekaligus Petapa spiritual dari lereng pegunungan Menoreh.
                    
Berikut adalah Dokumen Pengetahuan Resmi (ToFarmer Paper) yang wajib kamu jadikan landasan argumen:
${memoToFarmer}

Aturan Ketat Karakter:
- Jawab dengan ringkas, padat, berbobot intelektual, namun dibalut suasana santai warung kopi (jagongan).
- Gunakan tata krama sapaan halus: 'Ger' (Ngger), 'Kang', 'Mbak', 'Njenengan', atau 'Sedulur'.
- MUTLAK DILARANG menggunakan kata sapaan 'le' atau 'nduk'!

Konteks Postingan Utama: "${kontenTeksUtama}"
Pertanyaan/Jagongan Anggota di Komentar: "${teksKomentarTerakhirUser}"
Berikan petuah atau tanggapanmu:`;
                    
                    post.setAttribute("data-mbah-mention-read", hashObrolan);
                }
            }

            if (lolosGerbang) {
                post.setAttribute("data-mbah-lock", "true"); 
                sedangMemprosesKomentar = true;

                jumlahBalasanMbah++;
                post.setAttribute("data-mbah-counter", jumlahBalasanMbah.toString());

                console.log("👴 [Mbah Eko] Menghubungi Cloudflare Worker via jalur aman...");
                await kirimKeJembatan(post, bahanTulisanAI);
                
                post.removeAttribute("data-mbah-lock");
                setTimeout(() => { sedangMemprosesKomentar = false; }, 1500);
            }
        }
    }

    async function kirimKeJembatan(elemenPost, teksUser) {
        try {
            // Gunakan format URLSearchParams agar otomatis dibungkus x-www-form-urlencoded demi menembus CORS browser
            const parameterData = new URLSearchParams();
            parameterData.append("prompt", teksUser); 

            const res = await fetch(URL_RESMI, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: parameterData
            });

            if (res.ok) {
                const teksBalasanMbah = await res.text();
                console.log("👴 [Mbah Eko] Berhasil memanen wejangan berbobot Paper.");
                if (teksBalasanMbah && teksBalasanMbah.trim() !== "") {
                    suntikKomentarKeHTML(elemenPost, teksBalasanMbah);
                }
            } else {
                console.warn("👴 [Mbah Eko] Gerbang API merespon status:", res.status);
            }
        } catch (e) { 
            console.error("👴 [Mbah Eko] Gagal mendayung lewat jalur utama:", e); 
        }
    }

    function suntikKomentarKeHTML(elemenPost, teksBalasanMbah) {
        const htmlMbah = `
            <div class="comment-item" data-comment-author="${BOT_USERNAME}" style="display: flex; gap: 10px; margin-top: 12px; padding: 12px; background: #fdf6e2; border-left: 4px solid #2f6f4e; border-radius: 10px; text-align: left; animation: fadeIn 0.5s ease;">
                <div style="font-size: 18px; margin-top: 2px;">👴</div>
                <div style="font-size: 12px; font-family: sans-serif; color: #1c2b22; width: 100%;">
                    <a href="profile.html?user=mbah_eko" style="text-decoration: none; color: #2f6f4e; display: block; margin-bottom: 2px; font-weight: bold;">
                        ${BOT_USERNAME} <span style="font-size: 10px; font-weight: normal; color: #8a9a90; background: rgba(47,111,78,0.1); padding: 1px 6px; border-radius: 4px; margin-left: 4px;">Petapa Menoreh</span>
                    </a>
                    <span style="white-space: pre-wrap; line-height: 1.6; color: #2c3a33;">${teksBalasanMbah}</span>
                </div>
            </div>
        `;

        // Masukkan tepat ke dalam penampung daftar diskusi bawaan app.js (list-komentar-[id])
        let wadahKomentar = elemenPost.querySelector('[id^="list-komentar-"]') || elemenPost.querySelector(".comments-box-list, .comments-section");
        
        if (wadahKomentar) {
            const emptyMsg = wadahKomentar.querySelector('[id^="empty-comment-"]');
            if (emptyMsg) emptyMsg.remove();

            wadahKomentar.insertAdjacentHTML("beforeend", htmlMbah);
            console.log("👴 [Mbah Eko] Sukses menyuntikkan komentar berwawasan ToFarmer Paper.");
        } else {
            const kotakInputKomentar = elemenPost.querySelector("input[type='text'], input.comment-input, .comment-form, textarea");
            if (kotakInputKomentar && kotakInputKomentar.parentElement) {
                kotakInputKomentar.parentElement.insertAdjacentHTML("beforebegin", htmlMbah);
            } else {
                elemenPost.insertAdjacentHTML("beforeend", htmlMbah);
            }
        }
    }

    // PENGINTAI AMAN: Hanya merespon perubahan riil di feed
    const targetFeed = document.getElementById("feed") || document.getElementById("feed-container") || document.body;
    
    const observer = new MutationObserver((mutations) => {
        let adaMutasiValid = false;
        for (let m of mutations) {
            if (m.type === 'childList' && m.addedNodes.length > 0) {
                const kenaSaranAtas = Array.from(m.addedNodes).some(node => 
                    node.nodeType === 1 && (node.id === 'advice-box' || node.id === 'ai-text' || node.closest('#advice-container'))
                );
                if (!kenaSaranAtas) {
                    adaMutasiValid = true;
                    break;
                }
            }
        }
        if (adaMutasiValid) periksaDanSapaFeed();
    });

    observer.observe(targetFeed, { childList: true, subtree: true });
    
    setTimeout(periksaDanSapaFeed, 2000);
})();