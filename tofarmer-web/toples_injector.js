/**
 * =================================================================
 * TOPLES ECOSYSTEM EXTERNAL INJECTOR (FULL FEATURES & INSTANT LOAD)
 * =================================================================
 * Mempertahankan seluruh fitur, tata letak, dan style asli ToFarmer.
 * Hanya mengganti isi konten feed saja secara presisi.
 */

(function() {
    // CONFIG ASSET
    const WALLET_TOPLES = "HVYBLWO7XBPO76SP7KBBYZ5ZVTCPWA5Z4RTVCYBH4IBL3GJFV5DBZTWNMI";
    const TOF_ASSET_ID = 3558306283;
    const TARGET_COMPOUNDING = 500000;

    async function periksaDanSuntikToples() {
        const urlParams = new URLSearchParams(window.location.search);
        const targetUsername = urlParams.get('u'); 

        // Jika bukan akun toples, biarkan sistem berjalan normal 100%
        if (!targetUsername || targetUsername.toUpperCase() !== 'TOPLES_ECOSYSTEM') {
            return; 
        }

        console.log("🏺 Toples Injector: Menyuntikkan Papan Celengan ke dalam Feed...");

        // 1. AMBIL SALDO REAL-TIME DARI BLOCKCHAIN ALGORAND
        let totalTofSekarang = 0;
        try {
            const res = await fetch(`https://mainnet-idx.algonode.cloud/v2/accounts/${WALLET_TOPLES}`);
            const dataAlgo = await res.json();
            const assets = dataAlgo.account?.assets || [];
            const tofAsset = assets.find(a => a["asset-id"] === TOF_ASSET_ID);
            if (tofAsset) {
                totalTofSekarang = Number(tofAsset.amount || 0) / 1e6;
            }
        } catch (e) {
            console.error("Gagal sinkronisasi data on-chain:", e);
        }

        // 2. AMBIL DATA PAPAN CATATAN DARI SUPABASE
        let contentLedger = `🏺 Toples kosong. Belum ada transaksi penitipan baru yang terdeteksi untuk fase berjalan ini.`;
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

        let persentaseIsi = (totalTofSekarang / TARGET_COMPOUNDING) * 100;
        if (persentaseIsi > 100) persentaseIsi = 100;
        if (persentaseIsi < 0) persentaseIsi = 0;

        // 3. AMBIL CONTAINER FEED (#userPosts) TANPA MERUSAK HEADER PROFILE ATAS
        const targetDiv = document.getElementById("userPosts");
        if (targetDiv) {
            const templateHtml = `
                <div class="toples-ecosystem-theme" style="width: 100%; margin: 0 auto; font-family: Inter, sans-serif; color: #1c2b22;">
                    
                    <div class="toples-progress-card" style="background: #fff; border: 1px solid rgba(47,111,78,.12); padding: 18px; border-radius: 12px; margin-bottom: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.01);">
                        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 10px; font-weight: 600;">
                            <span>Status Akumulasi Celengan Saat Ini:</span>
                            <span style="color: #2f6f4e; font-size:14px; font-weight: 700;">${totalTofSekarang.toLocaleString('id-ID')} / 500,000 TOF</span>
                        </div>
                        <div style="background: #e4e7e5; height: 14px; border-radius: 7px; overflow: hidden; margin-bottom: 8px;">
                            <div class="progress-bar-fill" style="background: #2f6f4e; height: 100%; width: 0%; transition: width 1.2s ease-in-out;"></div>
                        </div>
                        <div style="font-size: 11px; color: #6f7f76; text-align: right; font-style: italic;">
                            ${persentaseIsi >= 100 ? '🔴 Target tercapai! Siap dieksekusi transfer konsolidasi manual ke Aset Utama.' : 'Menunggu genap 500.000 TOF untuk disetor ke Aset Utama.'}
                        </div>
                    </div>

                    <div style="background: #fff; border-left: 4px solid #2f6f4e; border-top: 1px solid rgba(47,111,78,.08); border-right: 1px solid rgba(47,111,78,.08); border-bottom: 1px solid rgba(47,111,78,.08); padding: 12px; font-size: 12px; color: #4c5a50; margin-bottom: 18px; border-radius: 0 12px 12px 0; line-height:1.5;">
                        <strong>🛡️ Transparansi Publik:</strong> Data kas ini disinkronkan langsung dari blockchain Algorand secara terbuka. Catatan kas dikunci khusus di halaman ini demi kenyamanan ekosistem.
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

            // Pasang konten visual tanpa menghapus element penting lainnya
            targetDiv.innerHTML = templateHtml;

            // Kunci element agar tidak ditimpa oleh logic postingan biasa di profile.js
            Object.defineProperty(targetDiv, 'innerHTML', {
                get: function() { return templateHtml; },
                set: function(val) { 
                    console.log("🛡️ Blokade Terpasang: Mengamankan tampilan celengan.");
                },
                configurable: true
            });

            // Jalankan animasi progress bar
            setTimeout(() => {
                const barFill = document.querySelector('.progress-bar-fill');
                if (barFill) barFill.style.width = persentaseIsi + '%';
            }, 100);

            // Auto Scroll log ke baris terbawah
            setTimeout(() => {
                const kotakLedger = document.querySelector('.ledger-content');
                if (kotakLedger) kotakLedger.scrollTop = kotakLedger.scrollHeight;
            }, 150);
        }
    }

    // =================================================================
    // LISTENERS UTAMAKAN KELANCARAN NAVIGASI (SPA FRIENDLY)
    // =================================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', periksaDanSuntikToples);
    } else {
        periksaDanSuntikToples();
    }

    const pemantauDOM = new MutationObserver(() => {
        if (document.getElementById("userPosts")) {
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