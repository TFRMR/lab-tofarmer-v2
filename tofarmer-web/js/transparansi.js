const supabaseClient = window.supabaseClient;
const TOF_ASSET_ID = 3558306283;

const summaryEl = document.getElementById("summary");
const feedEl = document.getElementById("feed");
const statusEl = document.getElementById("status");
const syncBtn = document.getElementById("syncBtn");

// Helper Delay untuk cegah rate limit
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Decode Note Algorand
function decodeNote(note) {
  try {
    return atob(note || "");
  } catch {
    return "";
  }
}

// Kategorisasi berdasarkan Note
function categorize(note = "") {
  const n = note.toUpperCase();

  if (!n) return "DANA_MASUK";
  if (n.includes("NABUNG")) return "NABUNG_RECEH";
  if (n.includes("REWARD")) return "REWARD";
  if (n.includes("DONASI")) return "DONASI";
  if (n.includes("LIQUID")) return "LIQUIDITAS";
  if (n.includes("TRANSAKSI")) return "TRANSAKSI";

  return "DANA_MASUK";
}


// ============================================================
// 1. AMBIL SEMUA ANGGOTA DARI SUPABASE (TANPA TERBURU-BURU FILTER)
// ============================================================
async function getAllWallets() {
  try {
    // Tarik hingga 1000 data profil dari Supabase
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("id, username")
      .range(0, 999);

    if (error) {
      console.error("Supabase Profile Error:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("Gagal koneksi ke Supabase:", err);
    return [];
  }
}


// ============================================================
// 2. SINKRONISASI BERKALA (ALGONODE ➔ SUPABASE)
// ============================================================
async function syncData() {
  if (syncBtn) syncBtn.disabled = true;
  if (statusEl) statusEl.innerText = "🔄 Memeriksa transaksi terbaru di Blockchain...";

  try {
    const profiles = await getAllWallets();

    if (profiles.length === 0) {
      throw new Error("Daftar anggota tidak ditemukan di Supabase.");
    }

    let totalSynced = 0;

    for (let i = 0; i < profiles.length; i++) {
      const user = profiles[i];
      const walletId = user.id || user.wallet;

      if (!walletId) continue; // Lewati jika id benar-benar tidak ada

      if (statusEl) {
        statusEl.innerText = `🔄 Memeriksa (${i + 1}/${profiles.length}): ${user.username || walletId}...`;
      }

      // Ambil transaksi transfer TOF dari Algonode
      const url = `https://mainnet-idx.algonode.cloud/v2/accounts/${walletId}/transactions?asset-id=${TOF_ASSET_ID}&tx-type=axfer&include-all=true&limit=50`;
      
      try {
        const res = await fetch(url);
        if (res.status === 404 || !res.ok) continue;

        const data = await res.json();
        const txs = data.transactions || [];

        for (let tx of txs) {
          const transfer = tx["asset-transfer-transaction"];
          if (!transfer || transfer["asset-id"] !== TOF_ASSET_ID) continue;

          const amountRaw = transfer.amount || 0;
          const note = decodeNote(tx.note);

          // Insert / Update ke Supabase
          const { error: upsertErr } = await supabaseClient
            .from("tof_history")
            .upsert([{
              wallet: walletId,
              username: user.username || walletId,
              tx_id: tx.id,
              amount: Number(amountRaw),
              note: note,
              category: categorize(note),
              sender: tx.sender,
              receiver: transfer.receiver,
              created_at: new Date(tx["round-time"] * 1000)
            }], { onConflict: "tx_id" });

          if (!upsertErr) totalSynced++;
        }
      } catch (e) {
        console.warn(`Gagal fetch Algonode untuk ${walletId}:`, e);
      }

      await sleep(100);
    }

    if (statusEl) statusEl.innerText = "✅ Sinkronisasi selesai! Database Supabase diperbarui.";
  } catch (err) {
    console.error("Gagal sync:", err);
    if (statusEl) statusEl.innerText = "❌ Gagal sync: " + err.message;
  } finally {
    if (syncBtn) syncBtn.disabled = false;
    loadReportFromSupabase();
  }
}


// ============================================================
// 3. LOAD TAMPILAN HALAMAN (PAKSA TAMPILKAN SELURUH ANGGOTA)
// ============================================================
// ============================================================
// LOAD TAMPILAN HALAMAN (ANTI-BREAKING / SAFE LOOP)
// ============================================================
async function loadReportFromSupabase() {
  if (statusEl) statusEl.innerText = "🔍 Memuat data seluruh anggota...";

  try {
    const profiles = await getAllWallets();
    console.log("TOTAL ANGGOTA DARI SUPABASE:", profiles.length);

    if (profiles.length === 0) {
      if (statusEl) statusEl.innerText = "⚠️ Data profil kosong.";
      return;
    }

    // Ambil riwayat transaksi
    const { data: history, error: hErr } = await supabaseClient
      .from("tof_history")
      .select("*")
      .order("created_at", { ascending: false })
      .range(0, 4999);

    if (hErr) console.error("Error tof_history:", hErr);

    const allHistory = history || [];
    let totalEcosystemBalance = 0;
    let renderedCount = 0;
    let fullHtml = `<h3 style="margin-bottom:1.5rem; text-align:center; color:#fde047;">👤 DETAIL KONTRIBUSI ANGGOTA (${profiles.length})</h3>`;

    // ITERASI AMAN METODE FOR-OF
    for (let i = 0; i < profiles.length; i++) {
      try {
        const user = profiles[i];
        if (!user) continue; // Skip jika object null

        const walletAddress = user.id || user.wallet || "";
        const displayName = user.username || walletAddress || `Anggota #${i + 1}`;

        // Filter transaksi dengan penanganan nilai null yang aman
        const userTxs = allHistory.filter((tx) => {
          if (!tx) return false;
          const w = (tx.wallet || "").toLowerCase();
          const s = (tx.sender || "").toLowerCase();
          const r = (tx.receiver || "").toLowerCase();
          const target = walletAddress.toLowerCase();

          return target && (w === target || s === target || r === target);
        });

        let userBalance = 0;
        let rowsHtml = "";

        if (userTxs.length === 0) {
          rowsHtml = `
            <tr>
              <td colspan="2" style="padding:10px 5px; text-align:center; color:#64748b; font-style:italic;">
                Belum ada riwayat transaksi TOF
              </td>
            </tr>
          `;
        } else {
          userTxs.forEach((tx) => {
            const displayAmount = Number(tx.amount || 0) / 1e6;
            
            const isReceiver = (tx.receiver || "").toLowerCase() === walletAddress.toLowerCase();
            const isSender = (tx.sender || "").toLowerCase() === walletAddress.toLowerCase();

            if (isReceiver) userBalance += displayAmount;
            if (isSender) userBalance -= displayAmount;

            const sign = isReceiver ? "+" : isSender ? "-" : "";
            const color = isReceiver ? "#4ade80" : isSender ? "#f87171" : "#64748b";

            rowsHtml += `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding:8px 5px;">
                  ${tx.created_at ? new Date(tx.created_at).toLocaleDateString() : "-"}
                  <div style="font-size:0.7rem; color:#64748b;">${tx.note || "-"}</div>
                </td>
                <td style="text-align:right; color:${color}; font-weight:bold;">
                  ${sign} ${displayAmount.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                </td>
              </tr>
            `;
          });
        }

        if (userBalance < 0) userBalance = 0;
        totalEcosystemBalance += userBalance;
        renderedCount++;

        // Render Card Accordion
        fullHtml += `
          <details class="card" style="margin-bottom:15px;">
            <summary style="cursor:pointer; font-weight:bold; color:#fde047; outline:none;">
              👤 ${displayName} 
              <span style="font-size:0.8rem; color:#64748b; font-weight:normal;">(${userTxs.length} Transaksi)</span>
            </summary>
            <div style="margin-top:15px;">
              <table style="width:100%; border-collapse: collapse; font-size: 0.9rem;">
                <thead>
                  <tr style="color: #64748b; border-bottom: 1px solid #334155;">
                    <th style="padding:5px; text-align:left;">Tanggal</th>
                    <th style="padding:5px; text-align:right;">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
                <tfoot>
                  <tr style="border-top: 2px solid #22c55e;">
                    <td style="padding:10px 5px; font-weight:bold;">ESTIMASI SALDO</td>
                    <td style="padding:10px 5px; text-align:right; color:#fde047;">TOF ${userBalance.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </details>
        `;

      } catch (itemError) {
        // Jika 1 akun error, cetak di console dan LANJUTKAN ke akun berikutnya
        console.error(`Gagal render akun index ke-${i}:`, itemError);
      }
    }

    // Update Ringkasan
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="card" style="text-align:center; border-left: 3px solid #eab308;">
          <h2 style="color:#fde047;">📊 RINGKASAN EKOSISTEM</h2>
          <p style="font-size:1.2rem; font-weight:bold; margin-top:10px;">TOTAL: TOF ${totalEcosystemBalance.toLocaleString()}</p>
          <p style="font-size:0.8rem; color:#64748b;">STATUS: ✅ DATABASE SUPABASE (${renderedCount}/${profiles.length} ANGGOTA)</p>
        </div>
      `;
    }

    if (feedEl) feedEl.innerHTML = fullHtml;
    if (statusEl) statusEl.innerText = `✅ Berhasil memuat ${renderedCount} dari ${profiles.length} anggota.`;

  } catch (err) {
    console.error("Gagal loadReportFromSupabase:", err);
    if (statusEl) statusEl.innerText = "❌ Error: " + err.message;
  }
}
// ============================================================
// 4. BIND EVENT & INITIAL RUN
// ============================================================
if (syncBtn) {
  syncBtn.addEventListener("click", syncData);
}

// Jalankan otomatis
loadReportFromSupabase();