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
    .select("id, username, saldo_tof");

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
// 3. KATEGORI NOTE
// ============================
function categorize(note = "") {
  const n = note.toUpperCase();

  if (n.includes("NABUNG")) return "NABUNG_RECEH";
  if (n.includes("REWARD")) return "REWARD";
  if (n.includes("DONASI")) return "DONASI";
  if (n.includes("LIQUID")) return "LIQUIDITAS";
  if (n.includes("TRANSAKSI")) return "TRANSAKSI";

  return "DANA_MASUK";
}

// ============================
// 4. SIMPAN KE SUPABASE CACHE
// ============================
async function saveTx(tx, wallet, username) {
  await supabaseClient.from("tof_history").upsert([
    {
      wallet,
      username,
      tx_id: tx.id,
      amount:
        tx["asset-transfer-transaction"]?.amount || 0,
      note: atob(tx.note || "") || "",
      category: categorize(atob(tx.note || "") || ""),
      sender: tx.sender,
      receiver: tx["asset-transfer-transaction"]?.receiver,
      created_at: new Date(tx["round-time"] * 1000),
    },
  ]);
}

// ============================
// 5. SYNC DATA (BUTTON)
// ============================
async function syncData() {
  statusEl.innerText = "🔄 Mengupdate laporan...";

  const wallets = await getAllWallets();

  for (let user of wallets) {
    const txs = await getWalletTx(user.id);

    for (let tx of txs) {
      const asset =
        tx["asset-transfer-transaction"]?.["asset-id"];

      if (asset !== TOF_ASSET_ID) continue;

      await saveTx(tx, user.id, user.username);
    }
  }

  statusEl.innerText = "✅ Laporan terbaru sudah diperbarui";

  loadFeed();
}

// ============================
// 6. LOAD CACHE → TAMPILKAN
// ============================
async function loadFeed() {
  const { data } = await supabaseClient
    .from("tof_history")
    .select("*")
    .order("created_at", { ascending: false });

  let total = 0;

  feedEl.innerHTML = "";

  data.forEach((tx) => {
    total += tx.amount;

    feedEl.innerHTML += `
      <div style="margin-bottom:10px;">
        <b>${tx.username}</b><br/>
        ${formatText(tx)}<br/>
        <small>${new Date(tx.created_at).toLocaleString()}</small>
        <hr/>
      </div>
    `;
  });

  summaryEl.innerHTML = `
    <h2>📊 Ringkasan</h2>
    <p>Total Transaksi: ${data.length}</p>
    <p>Total Volume: ${total} TOF</p>
  `;
}

// ============================
// 7. TEMPLATE NARASI
// ============================
function formatText(tx) {
  const cat = tx.category;

  if (cat === "NABUNG_RECEH")
    return `🌱 menyisihkan TOF ${tx.amount} untuk nabung receh`;

  if (cat === "REWARD")
    return `🎁 menerima reward TOF ${tx.amount}`;

  if (cat === "DONASI")
    return `❤️ berdonasi TOF ${tx.amount}`;

  if (cat === "LIQUIDITAS")
    return `💧 menambah likuiditas TOF ${tx.amount}`;

  if (cat === "TRANSAKSI")
    return `🔄 transaksi TOF ${tx.amount}`;

  return `💰 dana masuk TOF ${tx.amount}`;
}

// ============================
// 8. EVENT BUTTON
// ============================
syncBtn.addEventListener("click", syncData);

// auto load pertama
loadFeed();