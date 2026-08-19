const supabaseClient = window.supabaseClient;
const TOF_ASSET_ID = 3558306283;

const summaryEl = document.getElementById("summary");
const feedEl = document.getElementById("feed");
const statusEl = document.getElementById("status");
const syncBtn = document.getElementById("syncBtn");

// Helper Delay untuk mencegah Rate Limit jika diperlukan
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
// 1. AMBIL SEMUA ANGGOTA DARI SUPABASE (TANPA LIMIT DEFAULT)
// ============================================================
async function getAllWallets() {
  try {
    const { data, error } = await supabaseClient
      .from("public_member_profiles") // <-- Membaca dari View khusus
      .select("id, username")
      .range(0, 999);

    if (error) {
      console.error("Supabase Error:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("Gagal koneksi Supabase:", err);
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
      if (statusEl) {
        statusEl.innerText = `🔄 Memeriksa (${i + 1}/${profiles.length}): ${user.username || user.id}...`;
      }

      // Ambil transaksi transfer TOF dari Algonode
      const url = `https://mainnet-idx.algonode.cloud/v2/accounts/${user.id}/transactions?asset-id=${TOF_ASSET_ID}&tx-type=axfer&include-all=true&limit=50`;
      
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
              wallet: user.id,
              username: user.username,
              tx_id: tx.id,
              amount: Number(amountRaw), // Micro-units utuh
              note: note,
              category: categorize(note),
              sender: tx.sender,
              receiver: transfer.receiver,
              created_at: new Date(tx["round-time"] * 1000)
            }], { onConflict: "tx_id" });

          if (!upsertErr) totalSynced++;
        }
      } catch (e) {
        console.warn(`Gagal fetch Algonode untuk ${user.id}:`, e);
      }

      await sleep(100); // Jeda kecil antar request
    }

    if (statusEl) statusEl.innerText = "✅ Sinkronisasi selesai! Database Supabase diperbarui.";
  } catch (err) {
    console.error("Gagal sync:", err);
    if (statusEl) statusEl.innerText = "❌ Gagal sync: " + err.message;
  } finally {
    if (syncBtn) syncBtn.disabled = false;
    loadReportFromSupabase(); // Render ulang dari Supabase
  }
}


// ============================================================
// 3. LOAD TAMPILAN HALAMAN (MURNI SUPABASE ➔ DOM)
// ============================================================
async function loadReportFromSupabase() {
  if (statusEl) statusEl.innerText = "🔍 Memuat data seluruh anggota dari Database...";

  try {
    // A. Ambil seluruh profil tanpa terpotong limit
    const profiles = await getAllWallets();
    console.log("JUMLAH ANGGOTA SUPABASE:", profiles.length);

    if (profiles.length === 0) {
      if (statusEl) statusEl.innerText = "⚠️ Data profil kosong atau terhalang RLS Supabase.";
      return;
    }

    // B. Ambil seluruh riwayat transaksi tanpa terpotong limit
    const { data: history, error: hErr } = await supabaseClient
      .from("tof_history")
      .select("*")
      .order("created_at", { ascending: false })
      .range(0, 4999); // Ambil hingga 5000 transaksi

    if (hErr) {
      console.error("Gagal ambil tof_history:", hErr);
    }

    const allHistory = history || [];
    console.log("TOTAL RIWAYAT DARI SUPABASE:", allHistory.length);

    let totalEcosystemBalance = 0;
    let fullHtml = `<h3 style="margin-bottom:1.5rem; text-align:center; color:#fde047;">👤 DETAIL KONTRIBUSI ANGGOTA (${profiles.length})</h3>`;

    // C. Iterasi seluruh 20 anggota
    profiles.forEach((user) => {
      // Filter transaksi milik user ini
      const userTxs = allHistory.filter(
        (tx) => tx.wallet === user.id || tx.sender === user.id || tx.receiver === user.id
      );

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
          const displayAmount = Number(tx.amount || 0) / 1e6; // Konversi micro-units ke TOF
          
          const isReceiver = tx.receiver === user.id;
          const isSender = tx.sender === user.id;

          // Kalkulasi saldo
          if (isReceiver) userBalance += displayAmount;
          if (isSender) userBalance -= displayAmount;

          const sign = isReceiver ? "+" : isSender ? "-" : "";
          const color = isReceiver ? "#4ade80" : isSender ? "#f87171" : "#64748b";

          rowsHtml += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding:8px 5px;">
                ${new Date(tx.created_at).toLocaleDateString()}
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

      // Konstruksi elemen Accordion
      fullHtml += `
        <details class="card" style="margin-bottom:15px;">
          <summary style="cursor:pointer; font-weight:bold; color:#fde047; outline:none;">
            👤 ${user.username || user.id} 
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
    });

    // D. Render ke HTML DOM
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
    if (statusEl) statusEl.innerText = `✅ Berhasil memuat seluruh ${profiles.length} anggota.`;

  } catch (err) {
    console.error("Gagal memuat data dari Supabase:", err);
    if (statusEl) statusEl.innerText = "❌ Gagal memuat data: " + err.message;
  }
}


// ============================================================
// 4. BIND EVENT & INITIAL RUN
// ============================================================
if (syncBtn) {
  syncBtn.addEventListener("click", syncData);
}

// Jalankan otomatis saat halaman pertama dibuka
loadReportFromSupabase();