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
// 2. AMBIL TRANSAKSI ALGONODE
// ============================
async function getWalletTx(wallet) {
  const url =
    `https://mainnet-idx.algonode.cloud/v2/accounts/${wallet}/transactions`;

  const res = await fetch(url);
  const data = await res.json();

  return data.transactions || [];
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

  const amountRaw =
    tx["asset-transfer-transaction"]?.amount || 0;

  const amount = Number(amountRaw) / 1e6;

  const note = decodeNote(tx.note);

  await supabaseClient.from("tof_history").upsert([{
    wallet,
    username,
    tx_id: tx.id,
    amount,
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
async function syncData() {
  const btn = document.getElementById("syncBtn");
  if (btn) btn.disabled = true;
  if (statusEl) statusEl.innerText = "🔄 Mengambil data murni dari Blockchain...";

  try {
    const wallets = await getAllWallets();

    for (let user of wallets) {
      const txs = await getWalletTx(user.id);

      // Filter hanya transaksi TOF yang valid
      const tofTxs = txs.filter(tx => 
        tx['asset-transfer-transaction']?.['asset-id'] === TOF_ASSET_ID
      );

      for (let tx of tofTxs) {
        // AMBIL DATA MURNI ON-CHAIN
        const transfer = tx['asset-transfer-transaction'];
        const amountRaw = transfer.amount;
        const amount = Number(amountRaw) / 1e6; // Pastikan desimal tepat
        
        // Tentukan siapa pengirim dan penerima berdasarkan struktur On-Chain
        const sender = tx.sender;
        const receiver = transfer.receiver;
        
        // Simpan ke Supabase sebagai "Source of Truth"
        await supabaseClient.from("tof_history").upsert([{
          wallet: user.id,
          username: user.username,
          tx_id: tx.id,
          amount: amount, 
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
    statusEl.innerText = "✅ Data berhasil disinkronisasi dengan Blockchain";
  } catch (error) {
    console.error("Sync Error:", error);
    statusEl.innerText = "❌ Gagal sync: " + error.message;
  } finally {
    if (btn) btn.disabled = false;
    loadReport(); // Update tampilan setelah sync selesai
  }
}

// ============================
// 7. GROUPING USER (tetap untuk histori)
// ============================
function groupByUser(data) {

  const grouped = {}

  data.forEach(tx => {

    const user = tx.username || tx.wallet

    if (!grouped[user]) {
      grouped[user] = {
        txs: [],
        wallet: tx.wallet
      }
    }

    grouped[user].txs.push(tx)
  })

  return grouped
}


// ============================
// 8. FORMAT BARIS
// ============================
function formatRow(tx) {

  const d = new Date(tx.created_at)

  const date = d.toLocaleDateString()
  const time = d.toLocaleTimeString()

  const type = tx.category || "DANA_MASUK"

  let label = ""

  if (type === "NABUNG_RECEH") label = "SETOR NABUNG RECEH"
  else if (type === "REWARD") label = "REWARD"
  else if (type === "DONASI") label = "DONASI"
  else if (type === "LIQUIDITAS") label = "LIQUIDITAS"
  else label = "DANA MASUK / KELUAR"

  return `${date} | ${time} | TOF ${tx.amount} | ${label}`
}


// ============================
// 9. REAL BALANCE (FIX ALLIO STYLE)
// ============================
async function getWalletBalance(wallet) {

  const url =
    `https://mainnet-idx.algonode.cloud/v2/accounts/${wallet}`;

  const res = await fetch(url);
  const data = await res.json();

  const assets = data.account?.assets || [];

  const tof = assets.find(
    a => a["asset-id"] === TOF_ASSET_ID
  );

  if (!tof) return 0;

  return Number(tof.amount || 0) / 1e6;
}


// ============================
// 10. LOAD REPORT FINAL (ON-CHAIN & TABEL ACCORDION)
// ============================
async function loadReport() {
  if (statusEl) statusEl.innerText = "🔍 Mengambil data langsung dari Blockchain...";
  
  const wallets = await getAllWallets();
  let totalAll = 0;
  
  // Kosongkan container sebelum memuat
  if (summaryEl) summaryEl.innerHTML = "";
  feedEl.innerHTML = "";

  let html = `<h3 style="margin-bottom:1.5rem; text-align:center;">👤 DETAIL KONTRIBUSI ANGGOTA</h3>`;

  for (let user of wallets) {
    const txs = await getWalletTx(user.id);
    const balance = await getWalletBalance(user.id);
    totalAll += balance;

    // Filter transaksi TOF
    const tofTxs = txs.filter(tx => tx['asset-transfer-transaction']?.['asset-id'] === TOF_ASSET_ID);

    html += `
      <details class="card" style="margin-bottom:15px; border-left: 3px solid #22c55e;">
        <summary style="cursor:pointer; font-weight:bold; color:#fde047; outline:none;">
          👤 ${user.username} 
          <span style="font-size:0.8rem; color:#64748b; font-weight:normal;">(Klik lihat detail)</span>
        </summary>
        <div style="margin-top:15px;">
          <table style="width:100%; border-collapse: collapse; font-size: 0.9rem;">
            <thead>
              <tr style="color: #64748b; border-bottom: 1px solid #334155;">
                <th style="padding:5px;">Tanggal</th>
                <th style="padding:5px; text-align:right;">Jumlah</th>
              </tr>
            </thead>
            <tbody>
    `;

  // Ganti bagian di dalam forEach pada loadReport dengan ini:
tofTxs.forEach(tx => {
  const transfer = tx['asset-transfer-transaction'];
  const amount = (transfer ? transfer.amount : 0) / 1000000;
  
  // LOGIKA AKURAT:
  // Jika wallet user adalah RECEIVER, maka itu MASUK (+)
  // Jika wallet user adalah SENDER, maka itu KELUAR (-)
  const isReceiver = transfer?.receiver === user.id;
  const isSender = tx.sender === user.id;
  
  // Kita tentukan tanda berdasarkan role wallet dalam transaksi
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

  // Tampilkan Summary di bagian atas
  summaryEl.innerHTML = `
    <div class="card" style="text-align:center;">
      <h2 style="color:#fde047;">📊 RINGKASAN EKOSISTEM</h2>
      <p style="font-size:1.2rem; font-weight:bold; margin-top:10px;">TOTAL: TOF ${totalAll.toLocaleString()}</p>
      <p style="font-size:0.8rem; color:#64748b;">STATUS: ✅ ON-CHAIN VERIFIED</p>
    </div>
  `;

  feedEl.innerHTML = html;
  if (statusEl) statusEl.innerText = "✅ Data On-Chain Berhasil Dimuat";
}

// ============================
// 11. EVENT BUTTON
// ============================
syncBtn.addEventListener("click", syncData);


// AUTO LOAD
loadReport();