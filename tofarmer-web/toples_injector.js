/**
 * =================================================================
 * TOPLES ECOSYSTEM EXTERNAL INJECTOR (MANDIRI & 100% AMAN DI LUAR)
 * =================================================================
 * File ini mengontrol visual dan data @TOPLES_ECOSYSTEM secara total 
 * tanpa mengganggu fungsionalitas core profile bawaan.
 */

(async function() {
    // 1. DETEKSI URL PARAMETER
    const urlParams = new URLSearchParams(window.location.search);
    const targetUsername = urlParams.get('u'); 

    // Taktik Kebal Case-Sensitive: Paksa teks URL menjadi uppercase saat divalidasi
    if (!targetUsername || targetUsername.toUpperCase() !== 'TOPLES_ECOSYSTEM') {
        return; // JIKA BUKAN TOPLES (BAIK KECIL MAUPUN BESAR), LEWATI.
    }

    console.log("🏺 Toples Injector Berhasil Mencegat Jalur Profil...");

    // ALAMAT DOMPET & ASSET CONFIG
    const WALLET_TOPLES = "HVYBLWO7XBPO76SP7KBBYZ5ZVTCPWA5Z4RTVCYBH4IBL3GJFV5DBZTWNMI";
    const TOF_ASSET_ID = 3558306283;
    const TARGET_COMPOUNDING = 500000;

    // 2. AMBIL SALDO REAL-TIME DARI BLOCKCHAIN ALGORAND
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

    // 3. AMBIL DATA PAPAN CATATAN DARI SUPABASE tabel 'posts'
    // Menggunakan window.supabaseClient yang sudah ada di platform Anda
    let contentLedger = `🏺 Toples kosong. Belum ada transaksi penitipan baru yang terdeteksi untuk fase berjalan ini.`;
    let tglMulai = "-";

    try {
        if (window.supabaseClient) {
            const { data: postAktif } = await window.supabaseClient
                .from("posts")
                .eq("user_id", WALLET_TOPLES) // Menggunakan wallet sebagai ID sesuai database Anda
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

    // HITUNG PROGRESS BAR
    let persentaseIsi = (totalTofSekarang / TARGET_COMPOUNDING) * 100;
    if (persentaseIsi > 100) persentaseIsi = 100;
    if (persentaseIsi < 0) persentaseIsi = 0;

  // 4. INJEKSI TEMPLATE HTML (Menimpa Kontainer Feed secara Eksternal)
    // Mengubah target pencarian dari 'profile-content' menjadi 'userPosts' sesuai HTML asli Anda
    const intervalCheck = setInterval(() => {
        const profileContentElement = document.getElementById("userPosts"); // <--- INI SUDAH DIGANTI JADI userPosts
        
        if (profileContentElement) {
            clearInterval(intervalCheck); // Hentikan pengecekan

            // Ganti isi komponen di dalam elemen userPosts dengan UI khusus Toples
            profileContentElement.innerHTML = `
                <div class="toples-ecosystem-theme" style="max-width: 600px; margin: 0 auto; padding: 15px; font-family: sans-serif; color: #333;">
                    
                    <div class="toples-header" style="text-align: center; background: #fdf6e2; padding: 20px; border-radius: 12px; border: 1px solid #f3e5be; margin-bottom: 20px;">
                        <div style="margin-bottom: 10px;"><span style="font-size: 48px;">🏺</span></div>
                        <h2 style="margin: 5px 0 0 0; font-size: 22px;">@TOPLES_ECOSYSTEM</h2>
                        <span style="display: inline-block; background: #cca43b; color: #fff; font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 20px; margin-top: 8px; text-transform: uppercase;">
                            Akun Sistem / Bendahara Penampung
                        </span>
                        <p style="font-size: 13px; color: #666; margin: 12px 0 0 0; line-height: 1.4;">
                            Tempat penitipan dana otomatis program Nabung Receh (On-Chain Algorand) sebelum digabungkan ke aset compounding utama.
                        </p>
                    </div>

                    <div class="toples-progress-card" style="background: #fff; border: 1px solid #e0e0e0; padding: 15px; border-radius: 12px; margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; font-weight: bold;">
                            <span>Status Akumulasi Celengan Saat Ini:</span>
                            <span style="color: #cca43b;">${totalTofSekarang.toLocaleString('id-ID')} / 500,000 TOF</span>
                        </div>
                        <div style="background: #eee; height: 12px; border-radius: 6px; overflow: hidden; margin-bottom: 6px;">
                            <div class="progress-bar-fill" style="background: #cca43b; height: 100%; width: 0%; transition: width 1s ease-in-out;"></div>
                        </div>
                        <div style="font-size: 11px; color: #888; text-align: right; font-style: italic;">
                            ${persentaseIsi >= 100 ? '🔴 Target tercapai! Siap dieksekusi transfer konsolidasi manual ke Aset Utama.' : 'Menunggu genap 500.000 TOF untuk disetor ke Aset Utama.'}
                        </div>
                    </div>

                    <div style="background: #f5f5f5; border-left: 4px solid #cca43b; padding: 12px; font-size: 12px; color: #666; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
                        <strong>🛡️ Catatan Internal:</strong> Data ini disinkronkan langsung dari blockchain. Catatan ini dikunci khusus di halaman profil ini dan sengaja disembunyikan dari Beranda Utama demi kenyamanan data finansial pengguna.
                    </div>

                    <div class="toples-feed">
                        <h3 style="font-size: 14px; color: #555; text-transform: uppercase; margin-bottom: 10px; padding-left: 5px;">Papan Catatan Penitipan Aktif</h3>
                        <div class="ledger-post" style="background: #fff; border: 1px solid #e0e0e0; padding: 18px; border-radius: 12px;">
                            <div style="font-size: 11px; color: #999; margin-bottom: 12px; border-bottom: 1px dashed #eee; padding-bottom: 6px;">
                                Blok Kertas Dimulai Sejak: ${tglMulai}
                            </div>
                            <div class="ledger-content" style="font-size: 13px; line-height: 1.6; white-space: pre-line; font-family: monospace; background: #fafafa; padding: 12px; border-radius: 6px; border: 1px solid #eaeaea; max-height: 300px; overflow-y: auto;">
                                ${contentLedger}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Eksekusi Animasi Progress Bar Luwes
            setTimeout(() => {
                const barFill = document.querySelector('.progress-bar-fill');
                if (barFill) barFill.style.width = persentaseIsi + '%';
            }, 100);

            // Eksekusi Auto Scroll log paling bawah
            setTimeout(() => {
                const kotakLedger = document.querySelector('.ledger-content');
                if (kotakLedger) kotakLedger.scrollTop = kotakLedger.scrollHeight;
            }, 150);
        }
    }, 50);

})();