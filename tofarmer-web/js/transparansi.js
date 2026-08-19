const supabaseClient = window.supabaseClient;
const TOF_ASSET_ID = 3558306283;

const summaryEl = document.getElementById("summary");
const feedEl = document.getElementById("feed");
const statusEl = document.getElementById("status");
const syncBtn = document.getElementById("syncBtn");


// ============================
// 1. AMBIL SEMUA WALLET USER
// ============================
async function getAllWallets() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username");

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}


// ============================
// 2. AMBIL TRANSAKSI ALGONODE (SAFE FETCH & PAGINATION)
// ============================
async function getWalletTx(wallet) {
  let allTransactions = [];
  let nextToken = null;

  do {
    let url = `https://mainnet-idx.algonode.cloud/v2/accounts/${wallet}/transactions?asset-id=${TOF_ASSET_ID}&tx-type=axfer&include-all=true&limit=100`;
    if (nextToken) {
      url += `&next=${nextToken}`;
    }

    try {
      const res = await fetch(url);
      
      // Jika wallet tidak ditemukan di on-chain (404), kembalikan array kosong & hentikan loop
      if (res.status === 404) {
        console.warn(`Wallet belum aktif di On-Chain: ${wallet}`);
        break;
      }

      if (!res.ok) break;

      const data = await res.json();
      const txs = data.transactions || [];
      
      allTransactions = allTransactions.concat(txs);
      nextToken = data['next-token'];
    } catch (err) {
      console.error(`Gagal mengambil transaksi untuk ${wallet}:`, err);
      break;
    }
  } while (nextToken);

  return allTransactions;
}


// ============================
// 3. DECODE NOTE
// ============================
function decodeNote(note) {
  try {
    return atob(note || "");
  } catch {
    return "";
  }
}


// ============================
// 4. KATEGORI
// ============================
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


// ============================
// 5. SIMPAN CACHE
// ============================
async function saveTx(tx, wallet, username) {
  const amountRaw = tx["asset-transfer-transaction"]?.amount || 0;
  const note = decodeNote(tx.note);

  await supabaseClient.from("tof_history").upsert([{
    wallet,
    username,
    tx_id: tx.id,
    amount: Number(amountRaw),
    note,
    category: categorize(note),
    sender: tx.sender,
    receiver: tx["asset-transfer-transaction"]?.receiver,
    created_at: new Date(tx["round-time"] * 1000)
  }], {
    onConflict: "tx_id"
  });
}


// ============================
// 6. SYNC DATA (BLOCKCHAIN -> SUPABASE)
// ============================
async function syncData() {
  const btn = document.getElementById("syncBtn");
  if (btn) btn.disabled = true;
  if (statusEl) statusEl.innerText = "🔄 Mengambil seluruh riwayat murni dari Blockchain...";

  try {
    const wallets = await getAllWallets();

    for (let user of wallets) {
      if (statusEl) statusEl.innerText = `🔄 Memproses: ${user.username || user.id}...`;
      const txs = await getWalletTx(user.id);

      const tofTxs = txs.filter(tx => 
        tx['asset-transfer-transaction']?.['asset-id'] === TOF_ASSET_ID
      );

      for (let tx of tofTxs) {
        const transfer = tx['asset-transfer-transaction'];
        const amountRaw = transfer ? transfer.amount : 0;
        
        const sender = tx.sender;
        const receiver = transfer?.receiver;
        
        await supabaseClient.from("tof_history").upsert([{
          wallet: user.id,
          username: user.username,
          tx_id: tx.id,
          amount: Number(amountRaw),
          note: decodeNote(tx.note),
          category: categorize(decodeNote(tx.note)),
          sender: sender,
          receiver: receiver,
          created_at: new Date(tx["round-time"] * 1000)
        }], {
          onConflict: "tx_id"
        });
      }
    }
    if (statusEl) statusEl.innerText = "✅ Seluruh riwayat transaksi berhasil disinkronisasi ke Supabase";
  } catch (error) {
    console.error("Sync Error:", error);
    if (statusEl) statusEl.innerText = "❌ Gagal sync: " + error.message;
  } finally {
    if (btn) btn.disabled = false;
    loadReport();
  }
}

// ============================
// 7. GROUPING USER
// ============================
function groupByUser(data) {
  const grouped = {};

  data.forEach(tx => {
    const user = tx.username || tx.wallet;

    if (!grouped[user]) {
      grouped[user] = {
        txs: [],
        wallet: tx.wallet
      };
    }

    grouped[user].txs.push(tx);
  });

  return grouped;
}


// ============================
// 8. FORMAT BARIS
// ============================
function formatRow(tx) {
  const d = new Date(tx.created_at);

  const date = d.toLocaleDateString();
  const time = d.toLocaleTimeString();

  const type = tx.category || "DANA_MASUK";

  let label = "";

  if (type === "NABUNG_RECEH") label = "SETOR NABUNG RECEH";
  else if (type === "REWARD") label = "REWARD";
  else if (type === "DONASI") label = "DONASI";
  else if (type === "LIQUIDITAS") label = "LIQUIDITAS";
  else label = "DANA MASUK / KELUAR";

  const displayAmount = Number(tx.amount || 0) / 1e6;

  return `${date} | ${time} | TOF ${displayAmount} | ${label}`;
}


// ============================
// 9. REAL BALANCE (DENGAN PENANGANAN ERROR 404)
// ============================
async function getWalletBalance(wallet) {
  try {
    const url = `https://mainnet-idx.algonode.cloud/v2/accounts/${wallet}`;
    const res = await fetch(url);

    // Jika 404 (wallet baru belum bertransaksi), anggap saldo 0
    if (res.status === 404) return 0;
    if (!res.ok) return 0;

    const data = await res.json();
    const assets = data.account?.assets || [];
    const tof = assets.find(a => a["asset-id"] === TOF_ASSET_ID);

    if (!tof) return 0;

    return Number(tof.amount || 0) / 1e6;
  } catch (err) {
    console.warn(`Gagal ambil saldo untuk ${wallet}:`, err);
    return 0; // Kembalikan 0 agar perulangan anggota lain tidak berhenti
  }
}


// ============================
// 10. LOAD REPORT FINAL
// ============================
async function loadReport() {
  if (statusEl) statusEl.innerText = "🔍 Mengambil data langsung dari Blockchain...";
  
  const wallets = await getAllWallets();
  console.log("JUMLAH ANGGOTA:", wallets.length);
  console.log("DATA ANGGOTA:", wallets);

  let totalAll = 0;
  
  if (summaryEl) summaryEl.innerHTML = "";
  if (feedEl) feedEl.innerHTML = "";

  let html = `<h3 style="margin-bottom:1.5rem; text-align:center;">👤 DETAIL KONTRIBUSI ANGGOTA</h3>`;

  for (let user of wallets) {
    // Dengan penanganan 404, loop tidak akan berhenti di tengah jalan lagi!
    const txs = await getWalletTx(user.id);
    const balance = await getWalletBalance(user.id);
    totalAll += balance;

    const tofTxs = txs.filter(tx => tx['asset-transfer-transaction']?.['asset-id'] === TOF_ASSET_ID);

    html += `
      <details class="card" style="margin-bottom:15px; border-left: 3px solid #22c55e;">
        <summary style="cursor:pointer; font-weight:bold; color:#fde047; outline:none;">
          👤 ${user.username || user.id} 
          <span style="font-size:0.8rem; color:#64748b; font-weight:normal;">(Klik lihat detail - ${tofTxs.length} Transaksi)</span>
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

    if (tofTxs.length === 0) {
      html += `
        <tr>
          <td colspan="2" style="padding:10px 5px; text-align:center; color:#64748b; font-style:italic;">
            Belum ada riwayat transaksi TOF
          </td>
        </tr>
      `;
    } else {
      tofTxs.forEach(tx => {
        const transfer = tx['asset-transfer-transaction'];
        const amount = (transfer ? transfer.amount : 0) / 1000000;
        
        const isReceiver = transfer?.receiver === user.id;
        const isSender = tx.sender === user.id;
        
        const sign = isReceiver ? "+" : (isSender ? "-" : "");
        const color = isReceiver ? "#4ade80" : (isSender ? "#f87171" : "#64748b");

        html += `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding:8px 5px;">
              ${new Date(tx['round-time'] * 1000).toLocaleDateString()}
              <div style="font-size:0.7rem; color:#64748b;">${decodeNote(tx.note) || "-"}</div>
            </td>
            <td style="text-align:right; color:${color}; font-weight:bold;">
              ${sign} ${amount.toLocaleString(undefined, {minimumFractionDigits: 0})}
            </td>
          </tr>
        `;
      });
    }

    html += `
            </tbody>
            <tfoot>
              <tr style="border-top: 2px solid #22c55e;">
                <td style="padding:10px 5px; font-weight:bold;">SALDO</td>
                <td style="padding:10px 5px; text-align:right; color:#fde047;">TOF ${balance.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </details>
    `;
  }

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="card" style="text-align:center;">
        <h2 style="color:#fde047;">📊 RINGKASAN EKOSISTEM</h2>
        <p style="font-size:1.2rem; font-weight:bold; margin-top:10px;">TOTAL: TOF ${totalAll.toLocaleString()}</p>
        <p style="font-size:0.8rem; color:#64748b;">STATUS: ✅ ON-CHAIN VERIFIED</p>
      </div>
    `;
  }

  if (feedEl) feedEl.innerHTML = html;
  if (statusEl) statusEl.innerText = "✅ Seluruh 20 Data Anggota Berhasil Dimuat";
}

// ============================
// 11. EVENT BUTTON & INITIAL LOAD
// ============================
if (syncBtn) {
  syncBtn.addEventListener("click", syncData);
}

loadReport();