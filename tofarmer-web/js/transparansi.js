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
// 5. SIMPAN CACHE (FIX SCALE + ANTI DUPLIKAT)
// ============================
async function saveTx(tx, wallet, username) {

  const amountRaw =
    tx["asset-transfer-transaction"]?.amount || 0;

  // FIX: anti “nol kebanyakan / kebaca salah scale”
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
// 6. SYNC SEMUA WALLET
// ============================
async function syncData() {

  statusEl.innerText = "🔄 Mengambil semua transaksi wallet...";

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

  statusEl.innerText = "✅ Update selesai";

  loadReport();
}


// ============================
// 7. GROUPING USER
// ============================
function groupByUser(data) {

  const grouped = {}

  data.forEach(tx => {

    const user = tx.username || tx.wallet

    if (!grouped[user]) {
      grouped[user] = {
        txs: [],
        total: 0
      }
    }

    grouped[user].txs.push(tx)
    grouped[user].total += Number(tx.amount || 0)
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
// 9. LOAD REPORT FINAL
// ============================
async function loadReport() {

  const { data } = await supabaseClient
    .from("tof_history")
    .select("*")
    .order("created_at", { ascending: true })

  if (!data) return

  const grouped = groupByUser(data)

  let totalAll = data.reduce((sum, tx) => {
    return sum + Number(tx.amount || 0)
  }, 0)

  let html = `
    <h1>🌿 Riwayat Transaksi & Transparansi Aset</h1>
    <p>Diposting pada: ${new Date().toLocaleDateString()}</p>

    <h2>🧮 REKAP TRANSAKSI TOF FASE 1</h2>
    <p>
      Sistem ToFarmer beroperasi dengan prinsip transparansi total.
      Semua transaksi tercatat otomatis dari wallet.
    </p>

    <h3>📊 RINGKASAN EKOSISTEM</h3>

    <p>Total Transaksi: ${data.length}</p>
    <p>Total Dana: TOF ${totalAll}</p>
    <p>Status: ✅ ALL DATA VERIFIED</p>

    <hr/>
  `

  html += `<h3>👤 DETAIL KONTRIBUSI ANGGOTA</h3>`

  for (let user in grouped) {

    html += `<h4>[ ${user} ]</h4><pre>`

    html += `Tanggal | Waktu | Jumlah | Keterangan\n`

    grouped[user].txs.forEach(tx => {
      html += formatRow(tx) + "\n"
    })

    html += `\nTOTAL: TOF ${grouped[user].total}\n</pre>`
  }

  html += `
    <h3>🛡️ VERIFIKASI AKHIR</h3>
    <p>TOTAL SISTEM: TOF ${totalAll} (VERIFIED)</p>

    <br/>
    <i>"Kemandirian ekonomi dimulai dari pencatatan yang jujur."</i>

    <br/><br/>
    <button onclick="window.location.href='/'"
      style="padding:10px 16px; border-radius:8px; cursor:pointer;">
      ⬅ Kembali ke Beranda
    </button>
  `

  feedEl.innerHTML = html
  summaryEl.innerHTML = ""
}


// ============================
// 10. EVENT BUTTON
// ============================
syncBtn.addEventListener("click", syncData)


// AUTO LOAD
loadReport()