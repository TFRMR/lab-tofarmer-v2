/**
 * =================================================================
 * TOPLES ECOSYSTEM EXTERNAL INJECTOR (TOTAL LOCKDOWN & PUBLIC ACCESS)
 * =================================================================
 */

(async function() {
    // 1. DETEKSI URL PARAMETER
    const urlParams = new URLSearchParams(window.location.search);
    const targetUsername = urlParams.get('u'); 

    if (!targetUsername || targetUsername.toUpperCase() !== 'TOPLES_ECOSYSTEM') {
        return; // JIKA BUKAN TOPLES, BIARKAN CORE PROFILE BERJALAN NORMAL
    }

    console.log("🏺 Toples Injector: Mode Publik Aktif. Mengunci Aliran Halaman...");

    // CONFIG ASSET
    const WALLET_TOPLES = "HVYBLWO7XBPO76SP7KBBYZ5ZVTCPWA5Z4RTVCYBH4IBL3GJFV5DBZTWNMI";
    const TOF_ASSET_ID = 3558306283;
    const TARGET_COMPOUNDING = 500000;

    // 2. AMBIL SALDO REAL-TIME DARI BLOCKCHAIN ALGORAND (Bisa diakses publik tanpa login)
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

    // 3. AMBIL DATA PAPAN CATATAN DARI SUPABASE (Bisa diakses publik jika Read RLS posts diizinkan anonim)
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

    // 4. SUNTIKKAN STYLESHEET PAKSA UNTUK MEMBUNUH RENDER BIASA
    // Kita suntik CSS tersembunyi agar element profile manusia tidak berkedip sama sekali
    const styleSakti = document.createElement('style');
    styleSakti.innerHTML = `
        #profile, #profileWorkspace { display: none !important; opacity: 0 !important; visibility: hidden !important; }
        #userPosts { display: block !important; visibility: visible !important; }
    `;
    document.head.appendChild(styleSakti);

    // 5. EKSEKUSI PEMASANGAN VISUAL PADA CONTAINER TARGET
    const intervalCheck = setInterval(() => {
        const profileContentElement = document.getElementById("userPosts");
        
        if (profileContentElement) {
            clearInterval(intervalCheck); 

            const templateHtml = `
                <div class="toples-ecosystem-theme" style="max-width: 600px; margin: 0 auto; padding: 15px; font-family: sans-serif; color: #1c2b22;">
                    
                    <div class="toples-header" style="text-align: center; background: #fdf6e2; padding: 20px; border-radius: 12px; border: 1px solid #f3e5be; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                        <div style="margin-bottom: 10px;"><span style="font-size: 48px;">🏺</span></div>
                        <h2 style="margin: 5px 0 0 0; font-size: 22px; font-weight:700;">@TOPLES_ECOSYSTEM</h2>
                        <span style="display: inline-block; background: #cca43b; color: #fff; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 20px; margin-top: 8px; text-transform: uppercase; letter-spacing:0.5px;">
                            Akun Sistem / Bendahara Penampung
                        </span>
                        <p style="font-size: 13px; color: #55625a; margin: 12px 0 0 0; line-height: 1.5;">
                            Tempat penitipan dana otomatis program Nabung Receh (On-Chain Algorand) sebelum digabungkan ke aset compounding utama.
                        </p>
                    </div>

                    <div class="toples-progress-card" style="background: #fff; border: 1px solid #e0e0e0; padding: 18px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.01);">
                        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 10px; font-weight: bold;">
                            <span>Status Akumulasi Celengan Saat Ini:</span>
                            <span style="color: #cca43b; font-size:14px;">${totalTofSekarang.toLocaleString('id-ID')} / 500,000 TOF</span>
                        </div>
                        <div style="background: #eee; height: 14px; border-radius: 7px; overflow: hidden; margin-bottom: 8px;">
                            <div class="progress-bar-fill" style="background: #cca43b; height: 100%; width: 0%; transition: width 1.2s ease-in-out;"></div>
                        </div>
                        <div style="font-size: 11px; color: #6f7f76; text-align: right; font-style: italic;">
                            ${persentaseIsi >= 100 ? '🔴 Target tercapai! Siap dieksekusi transfer konsolidasi manual ke Aset Utama.' : 'Menunggu genap 500.000 TOF untuk disetor ke Aset Utama.'}
                        </div>
                    </div>

                    <div style="background: #f4f7f5; border-left: 4px solid #cca43b; padding: 12px; font-size: 12px; color: #4c5a50; margin-bottom: 20px; border-radius: 0 8px 8px 0; line-height:1.4;">
                        <strong>🛡️ Transparansi Publik:</strong> Data ini disinkronkan langsung dari blockchain Algorand secara terbuka. Catatan kas dikunci khusus di halaman profil ini demi kenyamanan ekosistem.
                    </div>

                    <div class="toples-feed">
                        <h3 style="font-size: 13px; color: #55625a; text-transform: uppercase; margin-bottom: 10px; padding-left: 2px; font-weight:700; letter-spacing:0.5px;">Papan Catatan Penitipan Aktif</h3>
                        <div class="ledger-post" style="background: #fff; border: 1px solid #e0e0e0; padding: 18px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.01);">
                            <div style="font-size: 11px; color: #999; margin-bottom: 12px; border-bottom: 1px dashed #eee; padding-bottom: 8px;">
                                Blok Kertas Dimulai Sejak: ${tglMulai}
                            </div>
                            <div class="ledger-content" style="font-size: 13px; line-height: 1.6; white-space: pre-line; font-family: monospace; background: #fafafa; padding: 12px; border-radius: 6px; border: 1px solid #eaeaea; max-height: 350px; overflow-y: auto;">
                                ${contentLedger}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            profileContentElement.innerHTML = templateHtml;

            // KUNCI MATI .innerHTML dari gangguan skrip luar
            Object.defineProperty(profileContentElement, 'innerHTML', {
                get: function() { return templateHtml; },
                set: function(val) { 
                    console.log("🛡️ Blokade Terpasang: Mencegah profile.js menimpa papan celengan.");
                },
                configurable: true
            });

            // Jalankan animasi progress bar
            setTimeout(() => {
                const barFill = document.querySelector('.progress-bar-fill');
                if (barFill) barFill.style.width = persentaseIsi + '%';
            }, 100);

            // Auto Scroll log paling bawah
            setTimeout(() => {
                const kotakLedger = document.querySelector('.ledger-content');
                if (kotakLedger) kotakLedger.scrollTop = kotakLedger.scrollHeight;
            }, 150);
        }
    }, 10);

})();