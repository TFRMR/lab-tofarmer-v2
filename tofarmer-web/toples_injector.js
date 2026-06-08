/**
 * =================================================================
 * TOPLES ECOSYSTEM EXTERNAL INJECTOR (PETANI PENJAGA & ALARM LUBER)
 * =================================================================
 * Ekosistem: ToFarmer (On-Chain Algorand)
 * Peran Akun: Robot Otomasi / Petani Penjaga Celengan Sementara
 * Batas Transisi Fase: 500,000 TOF (Estimasi Rp500.000.000)
 */

(function() {
    // ==========================================
    // CONFIG ASSET & TARGET DATA
    // ==========================================
    const WALLET_TOPLES = "HVYBLWO7XBPO76SP7KBBYZ5ZVTCPWA5Z4RTVCYBH4IBL3GJFV5DBZTWNMI";
    const TOF_ASSET_ID = 3558306283;
    const TARGET_COMPOUNDING = 500; // Target Utama 100% (500 TOF)

    async function periksaDanSuntikToples() {
        const urlParams = new URLSearchParams(window.location.search);
        const targetUsername = urlParams.get('u'); 

        // Jika bukan akun toples, biarkan sistem inti ToFarmer berjalan 100% normal
        if (!targetUsername || targetUsername.toUpperCase() !== 'TOPLES_ECOSYSTEM') {
            return; 
        }

        console.log("🏺 Toples Injector: Sistem Robot Petani Penjaga Aktif...");

        // ==========================================
        // 1. BAJAK KARTU PROFIL ATAS (IDENTITAS ROBOT)
        // ==========================================
        const headerProfileDiv = document.getElementById("profile");
        if (headerProfileDiv && !headerProfileDiv.innerHTML.includes('robot-avatar')) {
            
            const robotHeaderHtml = `
                <div class="card" style="background:#fff; border:1px solid rgba(47,111,78,.12); border-radius:12px; padding:24px; text-align:center; box-shadow:0 4px 12px rgba(0,0,0,0.01);">
                    
                    <div class="robot-avatar" style="width: 90px; height: 90px; background: #fdf6e2; border: 2px solid #2f6f4e; border-radius: 50%; margin: 0 auto 12px auto; display: flex; align-items: center; justify-content: center; font-size: 42px; box-shadow: 0 4px 8px rgba(47,111,78,0.1);">
                        🏺
                    </div>

                    <h2 style="margin: 0 0 4px 0; font-size: 20px; font-weight: 700; color: #1c2b22;">@TOPLES_ECOSYSTEM</h2>
                    
                    <div style="margin-bottom: 14px;">
                        <span style="display: inline-block; background: #2f6f4e; color: #fff; font-size: 10px; font-weight: bold; padding: 3px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
                            ⚙️ 🏺ROBOT OTOMASI / BENDAHARA CELENGAN SEMANTARA
                        </span>
                    </div>

                    <p style="font-size: 13px; color: #4c5a50; max-width: 460px; margin: 0 auto; line-height: 1.6; font-style: italic;">
                        "Saya adalah sistem otomatis pelayan ladang ToFarmer. Tugas utama saya hanya berdiam di sini, mengawasi gerbang blockchain, dan menjaga setiap butir koin dari program Nabung Receh agar tetap genap di dalam celengan sebelum diantar ke lumbung utama."
                    </p>

                </div>
            `;

            headerProfileDiv.innerHTML = robotHeaderHtml;

            // Kunci elemen profil atas agar tidak dioverwrite oleh logic profile.js bawaan
            Object.defineProperty(headerProfileDiv, 'innerHTML', {
                get: function() { return robotHeaderHtml; },
                set: function(val) { /* Memblokir timpaan data XP/Level user biasa */ },
                configurable: true
            });
        }

        // ==========================================
        // 2. KONEKSI DATA REAL-TIME (BLOCKCHAIN & SUPABASE)
        // ==========================================
        let totalTofSekarang = 0;
        try {
            const res = await fetch(`https://mainnet-api.algonode.cloud/v2/accounts/${WALLET_TOPLES}`);
            if (res.ok) {
                const account = await res.json();
                const asset = account.assets?.find(a => Number(a["asset-id"]) === TOF_ASSET_ID);
                if (asset) {
                    totalTofSekarang = Number(asset.amount) / 1000000;
                }
            }
        } catch (e) {
            console.error("Gagal sinkronisasi data on-chain:", e);
        }

        let contentLedger = `🏺 Toples kosong. Belum ada catatan mutasi baru yang terdeteksi pada fase berjalan ini.`;
        let tglMulai = "-";

        try {
            if (window.supabaseClient) {
                const { data: postAktif } = await window.supabaseClient
                    .from("posts")
                    .eq("user_id", WALLET_TOPLES)
                    .eq("status", "AKTIF_PENITIPAN")
                    .single();

                if (postAktif) {
                    contentLedger = postAktif.content;
                    tglMulai = new Date(postAktif.created_at).toLocaleString('id-ID');
                }
            }
        } catch (dbErr) {
            console.error("Gagal menarik data ledger dari Supabase:", dbErr);
        }

        // ==========================================
        // 3. LOGIKA HITUNGAN DINAMIS & MONITOR LUBERAN
        // ==========================================
        let persentaseIsi = (totalTofSekarang / TARGET_COMPOUNDING) * 100;
        
        // Atur warna & teks peringatan berdasarkan keterisian toples
        let warnaBar = "#2f6f4e"; // Warna hijau khas ToFarmer saat normal
        let teksPemberitahuan = `Menunggu genap 500 TOF untuk disetor dan dilebur ke Aset Utama (Fase Compounding).`;

        if (persentaseIsi >= 100) {
            warnaBar = "#d32f2f"; // Berubah MERAH menyala jika target jebol/luber
            teksPemberitahuan = `🔴 TARGET PENUH (${persentaseIsi.toFixed(1)}%)! Celengan luber. Siap dieksekusi transfer konsolidasi manual ke Aset Utama.`;
        }

        // Batasi panjang fisik progress bar maksimal 120% agar tidak menjebol layout border kanan
        let visualBarPercent = persentaseIsi;
        if (visualBarPercent > 120) visualBarPercent = 120;
        if (visualBarPercent < 0) visualBarPercent = 0;

        // ==========================================
        // 4. PASANG KONTEN VISUAL PADA AREA FEED (#userPosts)
        // ==========================================
        const feedDiv = document.getElementById("userPosts");
        if (feedDiv) {
            const templateHtml = `
                <div class="toples-ecosystem-theme" style="width: 100%; margin: 0 auto; font-family: Inter, sans-serif; color: #1c2b22;">
                    
                    <div class="toples-progress-card" style="background: #fff; border: 1px solid rgba(47,111,78,.12); padding: 18px; border-radius: 12px; margin-bottom: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.01);">
                        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 5px; font-weight: 600;">
                            <span>Status Akumulasi Celengan Saat Ini:</span>
                            <span style="color: ${warnaBar}; font-size:14px; font-weight: 700; transition: color 0.3s ease;">
                                ${totalTofSekarang.toLocaleString('id-ID')} / 500,000 TOF
                            </span>
                        </div>
                        
                        <div style="font-size: 11px; color: #6f7f76; margin-bottom: 10px; font-style: italic;">
                            Estimasi Pencatatan Buku: Rp ${(totalTofSekarang * 1000).toLocaleString('id-ID')} / Rp ${(TARGET_COMPOUNDING * 1000).toLocaleString('id-ID')}
                        </div>

                        <div style="background: #e4e7e5; height: 14px; border-radius: 7px; overflow: hidden; margin-bottom: 8px;">
                            <div class="progress-bar-fill" style="background: ${warnaBar}; height: 100%; width: 0%; transition: width 1.2s ease-in-out, background-color 0.5s ease;"></div>
                        </div>
                        
                        <div style="font-size: 11px; color: ${persentaseIsi >= 100 ? '#d32f2f' : '#6f7f76'}; text-align: right; font-weight: ${persentaseIsi >= 100 ? 'bold' : 'normal'}; transition: color 0.3s ease;">
                            ${teksPemberitahuan}
                        </div>
                    </div>

                    <div style="background: #fff; border-left: 4px solid ${warnaBar}; border-top: 1px solid rgba(47,111,78,.08); border-right: 1px solid rgba(47,111,78,.08); border-bottom: 1px solid rgba(47,111,78,.08); padding: 12px; font-size: 12px; color: #4c5a50; margin-bottom: 18px; border-radius: 0 12px 12px 0; line-height:1.5; transition: border-color 0.3s ease;">
                        <strong>🛡️ Transparansi Publik:</strong> Data kas ini disinkronkan langsung dari blockchain Algorand secara terbuka. Papan catatan dikunci khusus di halaman ini demi kenyamanan ekosistem.
                    </div>

                    <div class="toples-feed">
                        <h3 style="font-size: 12px; color: #6f7f76; text-transform: uppercase; margin-bottom: 8px; padding-left: 2px; font-weight:700; letter-spacing:0.5px;">Papan Catatan Penitipan Aktif</h3>
                        <div class="ledger-post" style="background: #fff; border: 1px solid rgba(47,111,78,.12); padding: 18px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.01);">
                            <div style="font-size: 11px; color: #999; margin-bottom: 12px; border-bottom: 1px dashed #e4e7e5; padding-bottom: 8px;">
                                📜 Blok Kertas Dimulai Sejak: ${tglMulai}
                            </div>
                            <div class="ledger-content" style="font-size: 13px; line-height: 1.6; white-space: pre-line; font-family: monospace; background: #fafafa; padding: 12px; border-radius: 6px; border: 1px solid #e4e7e5; max-height: 350px; overflow-y: auto;">
                                ${contentLedger}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            feedDiv.innerHTML = templateHtml;

            // Kunci elemen agar tidak bisa dioverwrite oleh post kiriman supabase dari profile.js bawaan
            Object.defineProperty(feedDiv, 'innerHTML', {
                get: function() { return templateHtml; },
                set: function(val) { /* Memblokir timpaan feed */ },
                configurable: true
            });

            // Jalankan animasi pengisian bar secara smooth
            setTimeout(() => {
                const barFill = document.querySelector('.progress-bar-fill');
                if (barFill) barFill.style.width = visualBarPercent + '%';
            }, 100);

            // Set otomatis scroll papan catatan ke paling bawah (log terbaru)
            setTimeout(() => {
                const kotakLedger = document.querySelector('.ledger-content');
                if (kotakLedger) kotakLedger.scrollTop = kotakLedger.scrollHeight;
            }, 150);
        }
    }

    // =================================================================
    // SPA ROUTING FRIENDLY LISTENERS (CEPAT TANPA RELOAD/REFRESH)
    // =================================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', periksaDanSuntikToples);
    } else {
        periksaDanSuntikToples();
    }

    const pemantauDOM = new MutationObserver(() => {
        if (document.getElementById("userPosts") || document.getElementById("profile")) {
            periksaDanSuntikToples();
        }
    });
    pemantauDOM.observe(document.body || document.documentElement, { childList: true, subtree: true });

    const originalPush = history.pushState;
    history.pushState = function() {
        originalPush.apply(this, arguments);
        periksaDanSuntikToples();
    };
    
    const originalReplace = history.replaceState;
    history.replaceState = function() {
        originalReplace.apply(this, arguments);
        periksaDanSuntikToples();
    };

    window.addEventListener('popstate', periksaDanSuntikToples);

})();