const supabaseClient = window.supabaseClient;
const TOF_ASSET_ID = 3558306283;

const summaryEl = document.getElementById("summary");
const feedEl = document.getElementById("feed");
const statusEl = document.getElementById("status");
const syncBtn = document.getElementById("syncBtn");

// Helper Delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// DAFTAR MASTER 20 ANGGOTA (DIJAMIN TIDAK AKAN TERPOTONG API)
// ============================================================
const MASTER_MEMBERS = [
  'THEBOXFARM', 'mbah_eko', 'Sanca', 'LIAN_HUA', 'CYBER_FARMER', 
  'QUANTUM_GROW', 'MARJIANTO', 'TERRA_ROOTS', 'FIELD_SYNC', 'Joker', 
  '_Elskay_', 'TOPLES_ECOSYSTEM', 'Supriyanto', 'Queen timmy', 'mekeii', 
  'NEO_AGRO', 'Ketelteyenk', 'Ega_Subana', 'MOUNTAIN_MOTHER', 'Sidikat farm'
];

// Decode Note Algorand
function decodeNote(note) {
  try {
    return atob(note || "");
  } catch {
    return "";
  }
}

// Categorize Note
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
// 1. AMBIL PROFIL (PRIORITAS DARI SUPABASE, FALLBACK KE MASTER LIST)
// ============================================================
async function getAllWallets() {
  try {
    // Coba tarik dari Supabase
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("id, username")
      .range(0, 999);

    if (error || !data || data.length < MASTER_MEMBERS.length) {
      console.warn("Menggunakan Master List karena Supabase terkena limit / RLS");
      
      // Jika Supabase cuma mengembalikan sedikit (misal 5), gabungkan dengan Master List
      const supabaseMap = new Map((data || []).map(p => [(p.username || "").toLowerCase(), p.id]));

      return MASTER_MEMBERS.map(name => ({
        id: supabaseMap.get(name.toLowerCase()) || name, // Gunakan ID dari DB jika ada, atau gunakan nama
        username: name
      }));
    }

    return data;
  } catch (err) {
    console.error("Gagal koneksi Supabase, menggunakan Master List:", err);
    return MASTER_MEMBERS.map(name => ({ id: name, username: name }));
  }
}


// ============================================================
// 2. SINKRONISASI (ALGONODE ➔ SUPABASE)
// ============================================================
async function syncData() {
  if (syncBtn) syncBtn.disabled = true;
  if (statusEl) statusEl.innerText = "🔄 Memeriksa transaksi terbaru di Blockchain...";

  try {
    const profiles = await getAllWallets();

    for (let i = 0; i < profiles.length; i++) {
      const user = profiles[i];
      const walletId = user.id || user.username;

      if (statusEl) {
        statusEl.innerText = `🔄 Memeriksa (${i + 1}/${profiles.length}): ${user.username}...`;
      }

      // Jangan fetch Algonode jika walletId bukan alamat Algorand valid (panjangnya biasa 58 karakter)
      if (!walletId || walletId.length < 30) continue;

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

          await supabaseClient
            .from("tof_history")
            .upsert([{
              wallet: walletId,
              username: user.username,
              tx_id: tx.id,
              amount: Number(amountRaw),
              note: note,
              category: categorize(note),
              sender: tx.sender,
              receiver: transfer.receiver,
              created_at: new Date(tx["round-time"] * 1000)
            }], { onConflict: "tx_id" });
        }
      } catch (e) {
        console.warn(`Gagal fetch Algonode untuk ${user.username}:`, e);
      }

      await sleep(50);
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
// 3. LOAD TAMPILAN HALAMAN (GARANSI 20 ANGGOTA TAMPIL)
// ============================================================
async function loadReportFromSupabase() {
  if (statusEl) statusEl.innerText = "🔍 Memuat data seluruh 20 anggota...";

  try {
    // Selalu dapatkan daftar 20 anggota
    const profiles = await getAllWallets();

    // Ambil seluruh riwayat transaksi
    const { data: history, error: hErr } = await supabaseClient
      .from("tof_history")
      .select("*")
      .order("created_at", { ascending: false })
      .range(0, 4999);

    if (hErr) console.error("Error fetching history:", hErr);

    const allHistory = history || [];
    let totalEcosystemBalance = 0;
    let fullHtml = `<h3 style="margin-bottom:1.5rem; text-align:center; color:#fde047;">👤 DETAIL KONTRIBUSI ANGGOTA (${profiles.length})</h3>`;

    // PAKSA LOOP TEPAT SEBANYAK ANGGOTA DI MASTER LIST
    for (let i = 0; i < profiles.length; i++) {
      const user = profiles[i];
      const username = user.username || `Anggota #${i + 1}`;
      const walletId = (user.id || "").toLowerCase();

      // Filter riwayat transaksi berdasarkan username ATAU wallet address
      const userTxs = allHistory.filter((tx) => {
        if (!tx) return false;
        const txUser = (tx.username || "").toLowerCase();
        const txWallet = (tx.wallet || "").toLowerCase();
        const txSender = (tx.sender || "").toLowerCase();
        const txReceiver = (tx.receiver || "").toLowerCase();

        const targetName = username.toLowerCase();

        return (
          txUser === targetName ||
          (walletId && (txWallet === walletId || txSender === walletId || txReceiver === walletId))
        );
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
          
          // Cek penambahan / pengurangan saldo
          const isReceiver = (tx.receiver || "").toLowerCase() === walletId || (tx.category || "").includes("MASUK");
          const isSender = (tx.sender || "").toLowerCase() === walletId;

          if (isReceiver) userBalance += displayAmount;
          else if (isSender) userBalance -= displayAmount;
          else userBalance += displayAmount; // Default fallback

          const sign = isReceiver ? "+" : isSender ? "-" : "+";
          const color = isReceiver ? "#4ade80" : isSender ? "#f87171" : "#4ade80";

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

      // Render HTML Card
      fullHtml += `
        <details class="card" style="margin-bottom:15px;">
          <summary style="cursor:pointer; font-weight:bold; color:#fde047; outline:none;">
            👤 ${username} 
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
    }

    // Render Summary
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="card" style="text-align:center; border-left: 3px solid #eab308;">
          <h2 style="color:#fde047;">📊 RINGKASAN EKOSISTEM</h2>
          <p style="font-size:1.2rem; font-weight:bold; margin-top:10px;">TOTAL: TOF ${totalEcosystemBalance.toLocaleString()}</p>
          <p style="font-size:0.8rem; color:#64748b;">STATUS: ✅ DATABASE SUPABASE (${profiles.length} ANGGOTA)</p>
        </div>
      `;
    }

    if (feedEl) feedEl.innerHTML = fullHtml;
    if (statusEl) statusEl.innerText = `✅ Berhasil memuat seluruh ${profiles.length} Anggota.`;

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

// Auto Load
loadReportFromSupabase();