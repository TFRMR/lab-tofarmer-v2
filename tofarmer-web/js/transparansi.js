const supabaseClient = window.supabaseClient;
const TOF_ASSET_ID = 3558306283;

const summaryEl = document.getElementById("summary");
const feedEl = document.getElementById("feed");
const statusEl = document.getElementById("status");
const syncBtn = document.getElementById("syncBtn");

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
// 1. DOWLOAD / SINKRONISASI BERKALA (ALGONODE ➔ SUPABASE)
// ============================================================
async function syncData() {
  if (syncBtn) syncBtn.disabled = true;
  if (statusEl) statusEl.innerText = "🔄 Memeriksa transaksi baru di Blockchain...";

  try {
    // A. Ambil semua profil/wallet dari Supabase
    const { data: profiles, error: profileErr } = await supabaseClient
      .from("profiles")
      .select("id, username");

    if (profileErr) throw profileErr;

    let newTxCount = 0;

    // B. Loop setiap wallet anggota
    for (let user of profiles) {
      if (statusEl) statusEl.innerText = `🔄 Memeriksa pembaruan untuk: ${user.username || user.id}...`;

      // Tarik transaksi ASSET TRANSFER (axfer) TOF saja dari Algonode
      const url = `https://mainnet-idx.algonode.cloud/v2/accounts/${user.id}/transactions?asset-id=${TOF_ASSET_ID}&tx-type=axfer&limit=50`;
      
      const res = await fetch(url);
      if (!res.ok) continue; // Jika wallet 404/belum aktif, lewati dengan aman

      const data = await res.json();
      const txs = data.transactions || [];

      // C. Filter & Simpan/Update perubahan baru ke Supabase
      for (let tx of txs) {
        const transfer = tx["asset-transfer-transaction"];
        if (!transfer || transfer["asset-id"] !== TOF_ASSET_ID) continue;

        const amountRaw = transfer.amount || 0;
        const note = decodeNote(tx.note);

        // Upsert: Masukkan data. Jika tx_id sudah ada, Supabase tidak akan menduplikasi
        const { error: upsertErr } = await supabaseClient
          .from("tof_history")
          .upsert([{
            wallet: user.id,
            username: user.username,
            tx_id: tx.id,
            amount: Number(amountRaw), // Disimpan angka utuh (Micro-units)
            note: note,
            category: categorize(note),
            sender: tx.sender,
            receiver: transfer.receiver,
            created_at: new Date(tx["round-time"] * 1000)
          }], { onConflict: "tx_id" });

        if (!upsertErr) newTxCount++;
      }
    }

    if (statusEl) statusEl.innerText = "✅ Sinkronisasi selesai! Data Supabase diperbarui.";
  } catch (err) {
    console.error("Gagal sync:", err);
    if (statusEl) statusEl.innerText = "❌ Gagal sync: " + err.message;
  } finally {
    if (syncBtn) syncBtn.disabled = false;
    // Setelah Supabase dapat update terbaru, muat ulang tampilan dari Supabase
    loadReportFromSupabase();
  }
}


// ============================================================
// 2. LOAD TAMPILAN HALAMAN (MURNI DARI SUPABASE ➔ HALAMAN)
// ============================================================
async function loadReportFromSupabase() {
  if (statusEl) statusEl.innerText = "🔍 Mengambil data dari Supabase...";

  try {
    // A. Ambil semua profil anggota
    const { data: profiles, error: pErr } = await supabaseClient
      .from("profiles")
      .select("id, username");

    if (pErr) throw pErr;

    // B. Ambil SELURUH riwayat transaksi langsung dari tabel Supabase
    const { data: history, error: hErr } = await supabaseClient
      .from("tof_history")
      .select("*")
      .order("created_at", { ascending: false });

    if (hErr) throw hErr;

    console.log("TOTAL ANGGOTA:", profiles.length);
    console.log("TOTAL RIWAYAT TRANSAKSI DARI SUPABASE:", history.length);

    let totalEcosystemBalance = 0;
    let fullHtml = `<h3 style="margin-bottom:1.5rem; text-align:center; color:#fde047;">👤 DETAIL KONTRIBUSI ANGGOTA (${profiles.length})</h3>`;

    // C. Olah data per Anggota
    profiles.forEach((user) => {
      // Filter transaksi milik user ini (sebagai penerima atau pengirim)
      const userTxs = history.filter(
        (tx) => tx.wallet === user.id || tx.sender === user.id || tx.receiver === user.id
      );

      // Hitung Saldo Bersih user dari database Supabase
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

          // Kalkulasi kalkulasi saldo (Masuk = +, Keluar = -)
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

      // Hindari saldo minus akibat penyesuaian awal
      if (userBalance < 0) userBalance = 0; 
      totalEcosystemBalance += userBalance;

      // Buat Accordion
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

    // D. Render Summary & List Anggota
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
    if (statusEl) statusEl.innerText = `✅ Berhasil memuat ${profiles.length} anggota dari Database.`;

  } catch (err) {
    console.error("Gagal memuat data dari Supabase:", err);
    if (statusEl) statusEl.innerText = "❌ Gagal memuat data: " + err.message;
  }
}


// ============================================================
// 3. EVENT BINDING & AUTO-RUN
// ============================================================
if (syncBtn) {
  syncBtn.addEventListener("click", syncData);
}

// Saat halaman pertama dibuka: LANGSUNG LOAD DARI SUPABASE (Super Cepat!)
loadReportFromSupabase();