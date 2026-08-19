const supabaseClient = window.supabaseClient;
const TOF_ASSET_ID = 3558306283;

const summaryEl = document.getElementById("summary");
const feedEl = document.getElementById("feed");
const statusEl = document.getElementById("status");
const syncBtn = document.getElementById("syncBtn");

// ============================
// 1. HELPER & DECODER
// ============================
function decodeNote(note) {
  try {
    return atob(note || "");
  } catch {
    return "";
  }
}

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

async function getAllWallets() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username");

  if (error) {
    console.error("Gagal mengambil data wallet:", error);
    return [];
  }
  return data;
}

// ============================
// 2. FETCH ALGONODE DENGAN PAGINATION (TARIK SEMUA SAMPAI AKHIR)
// ============================
async function fetchAllWalletTxFromAlgonode(walletId, onProgress) {
  let allTxs = [];
  let nextToken = null;
  let page = 1;
  const limit = 100; // Pembatasan indexer Algonode per panggil

  do {
    let url = `https://mainnet-idx.algonode.cloud/v2/accounts/${walletId}/transactions?limit=${limit}`;
    if (nextToken) {
      url += `&next=${nextToken}`;
    }

    if (onProgress) {
      onProgress(`Mengambil batch ${page} (${allTxs.length} transaksi terkumpul)...`);
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Algonode HTTP error! status: ${res.status}`);
    
    const data = await res.json();
    const txs = data.transactions || [];
    
    allTxs = allTxs.concat(txs);
    nextToken = data['next-token']; // Token untuk transaksi berikutnya
    page++;

  } while (nextToken);

  return allTxs;
}

// ============================
// 3. SYNC BERTAHAP (ON-CHAIN -> SUPABASE)
// ============================
async function syncData() {
  if (syncBtn) syncBtn.disabled = true;
  
  try {
    const wallets = await getAllWallets();
    let totalSynced = 0;

    for (let i = 0; i < wallets.length; i++) {
      const user = wallets[i];
      if (statusEl) {
        statusEl.innerText = `🔄 [${i + 1}/${wallets.length}] Memproses Wallet ${user.username || user.id}...`;
      }

      // Tarik seluruh transaksi secara bertahap
      const txs = await fetchAllWalletTxFromAlgonode(user.id, (msg) => {
        if (statusEl) statusEl.innerText = `🔄 [${user.username}] ${msg}`;
      });

      // Filter hanya transaksi Asset TOF
      const tofTxs = txs.filter(tx => 
        tx['asset-transfer-transaction']?.['asset-id'] === TOF_ASSET_ID
      );

      if (tofTxs.length > 0) {
        // Susun payload untuk batch upsert ke Supabase
        const payload = tofTxs.map(tx => {
          const transfer = tx['asset-transfer-transaction'];
          const amountRaw = transfer?.amount || 0; // Angka utuh/micro-units dari blockchain
          const noteText = decodeNote(tx.note);

          return {
            wallet: user.id,
            username: user.username,
            tx_id: tx.id,
            amount: Number(amountRaw), // SIMPAN ANGKA BULAT (Aman untuk BIGINT Supabase)
            note: noteText,
            category: categorize(noteText),
            sender: tx.sender,
            receiver: transfer?.receiver || "",
            created_at: new Date(tx["round-time"] * 1000).toISOString()
          };
        });

        // Simpan ke Supabase (Menggunakan upsert agar tidak duplikat)
        const { error } = await supabaseClient
          .from("tof_history")
          .upsert(payload, { onConflict: "tx_id" });

        if (error) console.error(`Error saving TX for ${user.id}:`, error);
        else totalSynced += payload.length;
      }
    }

    if (statusEl) statusEl.innerText = `✅ Sync Selesai! ${totalSynced} transaksi TOF tersimpan di Supabase.`;

  } catch (error) {
    console.error("Sync Error:", error);
    if (statusEl) statusEl.innerText = "❌ Gagal sync: " + error.message;
  } finally {
    if (syncBtn) syncBtn.disabled = false;
    // Refresh tampilan Web utama membaca data Supabase terbaru
    loadReport();
  }
}

// ============================
// 4. LOAD REPORT (SUPABASE UTAMA / SOURCE OF TRUTH)
// ============================
async function loadReport() {
  if (statusEl) statusEl.innerText = "🔍 Memuat data dari Lumbung Supabase...";

  try {
    // 1. Ambil semua histori transaksi langsung dari Supabase
    const { data: dbHistory, error } = await supabaseClient
      .from("tof_history")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // 2. Ambil daftar profil wallet
    const wallets = await getAllWallets();

    // Grouping transaksi berdasarkan wallet
    const groupedTxs = {};
    let totalAllBalance = 0;

    // Inisialisasi awal
    wallets.forEach(w => {
      groupedTxs[w.id] = {
        username: w.username || w.id,
        txs: [],
        balance: 0 // Dalam satuan desimal TOF
      };
    });

    // Kalkulasi saldo & gabungkan transaksi berdasarkan record di Supabase
    (dbHistory || []).forEach(tx => {
      // Konversi dari bigint micro-units ke TOF desimal
      const amountTOF = Number(tx.amount || 0) / 1e6;

      // Jika receiver, saldo bertambah untuk receiver
      if (groupedTxs[tx.receiver]) {
        groupedTxs[tx.receiver].balance += amountTOF;
      }
      // Jika sender, saldo berkurang untuk sender
      if (groupedTxs[tx.sender]) {
        groupedTxs[tx.sender].balance -= amountTOF;
      }

      // Masukkan log ke wallet pemilik
      if (groupedTxs[tx.wallet]) {
        groupedTxs[tx.wallet].txs.push({
          ...tx,
          amountTOF // Simpan nilai desimal khusus untuk tampilan UI
        });
      }
    });

    // Render HTML Tampilan
    let html = `<h3 style="margin-bottom:1.5rem; text-align:center;">👤 DETAIL KONTRIBUSI ANGGOTA</h3>`;

    Object.keys(groupedTxs).forEach(walletId => {
      const userGroup = groupedTxs[walletId];
      totalAllBalance += userGroup.balance;

      html += `
        <details class="card" style="margin-bottom:15px; border-left: 3px solid #22c55e;">
          <summary style="cursor:pointer; font-weight:bold; color:#fde047; outline:none;">
            👤 ${userGroup.username} 
            <span style="font-size:0.8rem; color:#64748b; font-weight:normal;">(${userGroup.txs.length} Transaksi)</span>
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
      `;

      if (userGroup.txs.length === 0) {
        html += `<tr><td colspan="2" style="padding:10px; text-align:center; color:#64748b;">Belum ada riwayat transaksi.</td></tr>`;
      } else {
        userGroup.txs.forEach(tx => {
          const isReceiver = tx.receiver === walletId;
          const isSender = tx.sender === walletId;
          
          const sign = isReceiver ? "+" : (isSender ? "-" : "");
          const color = isReceiver ? "#4ade80" : (isSender ? "#f87171" : "#64748b");

          html += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding:8px 5px; text-align:left;">
                ${new Date(tx.created_at).toLocaleDateString()}
                <div style="font-size:0.7rem; color:#64748b;">${tx.note || "-"}</div>
              </td>
              <td style="text-align:right; color:${color}; font-weight:bold;">
                ${sign} ${tx.amountTOF.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 6})}
              </td>
            </tr>
          `;
        });
      }

      html += `
              </tbody>
              <tfoot>
                <tr style="border-top: 2px solid #22c55e;">
                  <td style="padding:10px 5px; font-weight:bold;">SALDO SISA</td>
                  <td style="padding:10px 5px; text-align:right; color:#fde047;">TOF ${userGroup.balance.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 6})}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </details>
      `;
    });

    // Update Ringkasan Ekosistem
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="card" style="text-align:center;">
          <h2 style="color:#fde047;">📊 RINGKASAN EKOSISTEM</h2>
          <p style="font-size:1.2rem; font-weight:bold; margin-top:10px;">TOTAL: TOF ${totalAllBalance.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 6})}</p>
          <p style="font-size:0.8rem; color:#4ade80;">STATUS: ✅ DATABASE SYNCHRONIZED</p>
        </div>
      `;
    }

    if (feedEl) feedEl.innerHTML = html;
    if (statusEl) statusEl.innerText = "✅ Data Supabase Berhasil Dimuat";

  } catch (err) {
    console.error("Load Report Error:", err);
    if (statusEl) statusEl.innerText = "❌ Gagal memuat data dari Supabase: " + err.message;
  }
}

// ============================
// 5. BIND EVENT & INITIAL LOAD
// ============================
if (syncBtn) {
  syncBtn.addEventListener("click", syncData);
}

// Auto load dari Supabase saat halaman dibuka
loadReport();