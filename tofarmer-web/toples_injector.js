/**
 * =================================================================
 * TOPLES ECOSYSTEM EXTERNAL INJECTOR (TRANSIT JAMINAN AUTOMATION)
 * =================================================================
 * Alur: Dompet pusat kirim TOF ke Toples + Memo (Username # Alamat Dompet).
 * Robot membedah Memo ganda untuk jaring pengaman database anti-salah-ketik.
 */

(function() {
    // ==========================================
    // CONFIG ASSET & TARGET DATA
    // ==========================================
    const WALLET_TOPLES = "HVYBLWO7XBPO76SP7KBBYZ5ZVTCPWA5Z4RTVCYBH4IBL3GJFV5DBZTWNMI";
    const TOF_ASSET_ID = 3558306283;
    const TARGET_COMPOUNDING = 500; // Target 500 TOF murni

    async function periksaDanSuntikToples() {
        const urlParams = new URLSearchParams(window.location.search);
        const targetUsername = urlParams.get('u'); 

        if (!targetUsername || targetUsername.toUpperCase() !== 'TOPLES_ECOSYSTEM') {
            return; 
        }

        console.log("🏺 Toples Injector: Mengaktifkan Sistem Ledger Transit Jaminan...");

        // ==========================================
        // 1. KARTU PROFIL ATAS (IDENTITAS ROBOT BENDAHARA)
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
                            🔒 ⚙️ 🏺ROBOT OTOMASI / BENDAHARA CELENGAN SEMANTARA
                        </span>
                    </div>
                    <p style="font-size: 13px; color: #4c5a50; max-width: 460px; margin: 0 auto; line-height: 1.6; font-style: italic;">
                        ""Saya adalah sistem otomatis pelayan ladang ToFarmer. Tugas utama saya hanya berdiam di sini, mengawasi gerbang blockchain, dan menjaga setiap butir koin dari program Nabung Receh agar tetap genap di dalam celengan sebelum diantar ke lumbung utama.""
                    </p>
                </div>
            `;
            headerProfileDiv.innerHTML = robotHeaderHtml;
            Object.defineProperty(headerProfileDiv, 'innerHTML', {
                get: function() { return robotHeaderHtml; },
                set: function(val) {},
                configurable: true
            });
        }

        // ==========================================
        // 2. AMBIL SALDO & BEDAH MEMO BLOCKCHAIN
        // ==========================================
        let totalTofSekarang = 0;
        let contentLedger = "";
        let transaksiDitemukan = false;

        try {
            // A. Ambil Saldo On-Chain Saat Ini
            const resSaldo = await fetch(`https://mainnet-api.algonode.cloud/v2/accounts/${WALLET_TOPLES}`);
            if (resSaldo.ok) {
                const accountData = await resSaldo.json();
                const asset = accountData.assets?.find(a => Number(a["asset-id"]) === TOF_ASSET_ID);
                if (asset) {
                    totalTofSekarang = Number(asset.amount) / 1000000;
                }
            }

            // B. Ambil Riwayat Transaksi Masuk
            const resTx = await fetch(`https://mainnet-idx.algonode.cloud/v2/assets/${TOF_ASSET_ID}/transactions?address=${WALLET_TOPLES}&address-role=receiver&limit=50`);
            if (resTx.ok) {
                const txData = await resTx.json();
                const transactions = txData.transactions || [];

                contentLedger = "\n";
                contentLedger += "       CATATAN TRANSIT: RECEH USER RIIL\n";
                contentLedger += "==================================================\n\n";

                for (const tx of transactions) {
                    if (tx["tx-type"] === "axfer" && tx["asset-transfer-transaction"]) {
                        const jumlah = Number(tx["asset-transfer-transaction"].amount) / 1000000;
                        
                        // 1. Ambil Note/Memo mentah dari Blockchain
                        let teksMemoRaw = "";
                        if (tx.note) {
                            try { teksMemoRaw = atob(tx.note).trim(); } catch (e) { teksMemoRaw = ""; }
                        }

                        let namaTampilanUser = "Anonim / Sistem";
                        let deskripsiNota = teksMemoRaw || "Setoran Jaminan";

                        if (teksMemoRaw) {
                            // Pecah teks note berdasarkan tanda pagar '#' untuk memisahkan username dan wallet
                            const bagianMemo = teksMemoRaw.split("#");
                            const inputUsername = bagianMemo[0] ? bagianMemo[0].trim() : "";
                            const inputWallet = bagianMemo[1] ? bagianMemo[1].trim() : "";

                            try {
                                if (window.supabaseClient) {
                                    let profileData = null;

                                   // Langkah A: Coba cari berdasarkan username dulu
if (inputUsername) {
    const { data } = await window.supabaseClient
        .from("profiles")
        .select("*") // <--- HARUS ADA .select("*") SEBELUM .eq()
        .eq("username", inputUsername)
        .maybeSingle(); 
    profileData = data;
}

// Langkah B: Jaring Pengaman! Cari berdasarkan alamat dompet (id)
if (!profileData && inputWallet) {
    const { data } = await window.supabaseClient
        .from("profiles")
        .select("*") // <--- HARUS ADA .select("*") DI SINI JUGA
        .eq("id", inputWallet)
        .maybeSingle();
    profileData = data;
}

                                    // Jika salah satu pencarian di atas berhasil menemukan user
                                    if (profileData && profileData.username) {
                                        namaTampilanUser = `@${profileData.username}`;
                                        deskripsiNota = "Titipan Uang Fisik Terbuku";
                                    } else {
                                        namaTampilanUser = inputUsername ? `@${inputUsername} (?)` : "User Tidak Terdaftar";
                                    }
                                }
                            } catch (dbErr) {
                                console.error("Gagal verifikasi data profiles di database:", dbErr);
                            }
                        }

                        // Susun baris teks di papan ledger
                        contentLedger += `📥 TERKUNCI : +${jumlah.toLocaleString('id-ID')} TOF (Rp ${(jumlah * 1000).toLocaleString('id-ID')})\n`;
                        contentLedger += `👤 Penabung : ${namaTampilanUser}\n`;
                        contentLedger += `📝 Memo Kas : "${deskripsiNota}"\n`;
                        contentLedger += `--------------------------------------------------\n`;
                        transaksiDitemukan = true;
                    }
                }

                if (!transaksiDitemukan) {
                    contentLedger += "🏺 Belum ada dana yang ditransitkan...\n";
                }
                contentLedger += "\n==================================================";
            }
        } catch (e) {
            console.error("Gagal memproses data ledger:", e);
            contentLedger = "⚠️ Robot sedang mengalami gangguan sinkronisasi sinyal on-chain.";
        }

        // ==========================================
        // 3. HITUNG PERSENTASE & WARNA ALARM LUBER
        // ==========================================
        let persentaseIsi = (totalTofSekarang / TARGET_COMPOUNDING) * 100;
        let warnaBar = "#2f6f4e"; 
        let teksPemberitahuan = `Menunggu akumulasi dana riil genap ${TARGET_COMPOUNDING} TOF sebelum disuntikkan ke Aset Utama.`;

        if (persentaseIsi >= 100) {
            warnaBar = "#d32f2f"; 
            teksPemberitahuan = `🔴 TERPENUHI (${persentaseIsi.toFixed(1)}%)! Siap setorkan uang fisik ke lumbung utama dan bagikan koin.`;
        }

        let visualBarPercent = persentaseIsi > 120 ? 120 : (persentaseIsi < 0 ? 0 : persentaseIsi);

        // ==========================================
        // 4. PASANG KONTEN VISUAL PADA AREA FEED (#userPosts)
        // ==========================================
        const feedDiv = document.getElementById("userPosts");
        if (feedDiv) {
            const templateHtml = `
                <div class="toples-ecosystem-theme" style="width: 100%; margin: 0 auto; font-family: Inter, sans-serif; color: #1c2b22;">
                    
                    <div class="toples-progress-card" style="background: #fff; border: 1px solid rgba(47,111,78,.12); padding: 18px; border-radius: 12px; margin-bottom: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.01);">
                        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 5px; font-weight: 600;">
                            <span>Aset Penahan Di Toples Saat Ini:</span>
                            <span style="color: ${warnaBar}; font-size:14px; font-weight: 700;">
                                ${totalTofSekarang.toLocaleString('id-ID')} / ${TARGET_COMPOUNDING} TOF
                            </span>
                        </div>
                        
                        <div style="font-size: 11px; color: #6f7f76; margin-bottom: 10px; font-style: italic;">
                            Nilai Riil Dana Transit: Rp ${(totalTofSekarang * 1000).toLocaleString('id-ID')} / Rp ${(TARGET_COMPOUNDING * 1000).toLocaleString('id-ID')}
                        </div>

                        <div style="background: #e4e7e5; height: 14px; border-radius: 7px; overflow: hidden; margin-bottom: 8px;">
                            <div class="progress-bar-fill" style="background: ${warnaBar}; height: 100%; width: 0%; transition: width 1.2s ease-in-out;"></div>
                        </div>
                        
                        <div style="font-size: 11px; color: ${persentaseIsi >= 100 ? '#d32f2f' : '#6f7f76'}; text-align: right; font-weight: ${persentaseIsi >= 100 ? 'bold' : 'normal'};">
                            ${teksPemberitahuan}
                        </div>
                    </div>

                    <div style="background: #fff; border-left: 4px solid ${warnaBar}; border-top: 1px solid rgba(47,111,78,.08); border-right: 1px solid rgba(47,111,78,.08); border-bottom: 1px solid rgba(47,111,78,.08); padding: 12px; font-size: 12px; color: #4c5a50; margin-bottom: 18px; border-radius: 0 12px 12px 0; line-height:1.5;">
                        <strong>🛡️ Transparansi Kas:</strong> Lembar ini memuat bukti penahanan aset sementara. Koin TOF di bawah ini belum dilepas ke sirkulasi aktif pasar sebelum uang fisik disetor utuh.
                    </div>

                    <div class="toples-feed">
                        <h3 style="font-size: 12px; color: #6f7f76; text-transform: uppercase; margin-bottom: 8px; padding-left: 2px; font-weight:700; letter-spacing:0.5px;">Buku Tabungan Sementara (Autopilot)</h3>
                        <div class="ledger-post" style="background: #fff; border: 1px solid rgba(47,111,78,.12); padding: 18px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.01);">
                            <div class="ledger-content" style="font-size: 12px; line-height: 1.6; white-space: pre-wrap; font-family: monospace; background: #fafafa; padding: 12px; border-radius: 6px; border: 1px solid #e4e7e5; max-height: 400px; overflow-y: auto;">
                                ${contentLedger}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            feedDiv.innerHTML = templateHtml;

            Object.defineProperty(feedDiv, 'innerHTML', {
                get: function() { return templateHtml; },
                set: function(val) {},
                configurable: true
            });

            // FIXED WINDOW TIMEOUT ANIMATION ATOMIC
            window.requestAnimationFrame(() => {
                setTimeout(() => {
                    const barFill = document.querySelector('.progress-bar-fill');
                    if (barFill) barFill.style.width = visualBarPercent + '%';
                }, 150);
            });
        }
    }

    // SPA ROUTING WORKERS
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