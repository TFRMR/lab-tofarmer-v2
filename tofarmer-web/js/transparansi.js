// Memastikan supabaseClient siap saat dipanggil
function getSupabase() {
  return window.supabaseClient || (window.supabase && window.supabase.createClient ? window.supabase : null);
}

const TOF_ASSET_ID = 3558306283;
const ALGONODE_INDEXER = "https://mainnet-idx.algonode.cloud/v2";

const summaryEl = document.getElementById("summary");
const feedEl = document.getElementById("feed");
const statusEl = document.getElementById("status");
const syncBtn = document.getElementById("syncBtn");

function setStatus(msg) {
  if (statusEl) statusEl.innerText = msg;
  console.log(msg);
}

// ---------------------------------------------------------
// 1. SUPABASE READERS (SAFE READ)
// ---------------------------------------------------------
async function getAllWallets() {
  const client = getSupabase();
  if (!client) throw new Error("Supabase Client belum siap / config-supabase.js error");

  let allProfiles = [], page = 0, size = 1000;
  while (true) {
    const { data, error } = await client
      .from("profiles")
      .select("id, username")
      .range(page * size, (page + 1) * size - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allProfiles.push(...data);
    if (data.length < size) break;
    page++;
  }
  return allProfiles;
}

async function getHistoryFromSupabase() {
  const client = getSupabase();
  let allData = [], page = 0, size = 1000;
  while (true) {
    const { data, error } = await client
      .from("tof_history")
      .select("wallet, username, tx_id, amount, note, category, sender, receiver, round, created_at")
      .order("created_at", { ascending: false })
      .range(page * size, (page + 1) * size - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < size) break;
    page++;
  }
  return allData;
}

async function getBalancesFromSupabase() {
  const client = getSupabase();
  const { data, error } = await client
    .from("tof_balances")
    .select("wallet, username, balance, updated_at");
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------
// 2. RENDER REPORT (TERSTRUKTUR & TAMPIL SEMUA WALLET)
// ---------------------------------------------------------
async function loadReport() {
  setStatus("⚡ Memuat data dari Supabase...");
  try {
    const wallets = await getAllWallets();
    const history = await getHistoryFromSupabase();
    const balances = await getBalancesFromSupabase();

    const balanceMap = {};
    balances.forEach(b => { 
      if (b.wallet) balanceMap[b.wallet] = Number(b.balance || 0); 
    });

    const grouped = {};
    history.forEach(tx => {
      const key = tx.wallet;
      if (key) {
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(tx);
      }
    });

    let totalAll = 0;
    wallets.forEach(u => totalAll += Number(balanceMap[u.id] || 0));

    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="card" style="text-align:center;">
          <h2 style="color:#fde047;">📊 RINGKASAN EKOSISTEM</h2>
          <p style="font-size:1.2rem; font-weight:bold; margin-top:10px;">
            TOTAL: TOF ${totalAll.toLocaleString()}
          </p>
          <p style="font-size:0.8rem; color:#64748b;">SOURCE: ✅ SUPABASE</p>
        </div>`;
    }

    let html = `<h3 style="margin-bottom:1.5rem; text-align:center;">👤 DETAIL KONTRIBUSI ANGGOTA (${wallets.length})</h3>`;
    
    // LOOP SEMUA WALLET SECARA AMAN
    wallets.forEach(u => {
      const wallet = u.id;
      const txs = grouped[wallet] || [];
      const balance = Number(balanceMap[wallet] || 0);
      const displayName = u.username ? `@${u.username}` : wallet;

      let txRows = "";
      if (txs.length === 0) {
        txRows = `<tr><td colspan="2" style="padding:10px; text-align:center; color:#64748b;">Belum ada catatan transaksi.</td></tr>`;
      } else {
        txs.forEach(tx => {
          const isReceiver = tx.receiver === wallet;
          const sign = isReceiver ? "+" : "-";
          const color = isReceiver ? "#4ade80" : "#f87171";
          const date = tx.created_at ? new Date(tx.created_at).toLocaleDateString("id-ID") : "-";
          const noteText = tx.note ? tx.note.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "-"; // Sanitize HTML

          txRows += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding:8px 5px;">
                ${date} 
                <div style="font-size:0.75rem; color:#94a3b8;">${noteText}</div>
              </td>
              <td style="text-align:right; color:${color}; font-weight:bold; white-space:nowrap;">
                ${sign} ${Number(tx.amount || 0).toLocaleString()} TOF
              </td>
            </tr>`;
        });
      }

      // RENDER DETAILED CARD UNTUK PER-USER
      html += `
        <details class="card" style="margin-bottom:15px;">
          <summary style="cursor:pointer; font-weight:bold; color:#fde047; outline:none; display:flex; justify-content:space-between; align-items:center;">
            <span>👤 ${displayName}</span>
            <span style="font-size:0.8rem; color:#64748b; font-weight:normal;">(${txs.length} transaksi)</span>
          </summary>
          <div style="margin-top:15px; overflow-x:auto;">
            <table style="width:100%; font-size:0.9rem; border-collapse:collapse;">
              <tbody>
                ${txRows}
              </tbody>
              <tfoot>
                <tr style="border-top:2px solid #22c55e;">
                  <td style="padding:10px 5px; font-weight:bold;">SALDO SAAT INI</td>
                  <td style="padding:10px 5px; text-align:right; color:#fde047; font-weight:bold;">TOF ${balance.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </details>`;
    });

    if (feedEl) feedEl.innerHTML = html;
    setStatus(`⚡ Berhasil me-render ${wallets.length} profil.`);
  } catch (err) {
    console.error(err);
    setStatus(`❌ Error: ${err.message}`);
  }
}
// ---------------------------------------------------------
// 3. ALGONODE SYNC (PENYEMPURNAAN PAGINATION & API ENDPOINT)
// ---------------------------------------------------------
async function getLatestNodeRound() {
  try {
    // Menggunakan Endpoint status resmi Algonode
    const res = await fetch("https://mainnet-api.algonode.cloud/v2/status");
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data["last-round"] || 0);
  } catch (e) {
    return 0;
  }
}

async function fetchWalletTx(wallet, username, minRound = null) {
  let nextToken = null, allTx = [];
  let safetyLoop = 0;

  do {
    safetyLoop++;
    if (safetyLoop > 50) break;

    const params = new URLSearchParams();
    params.set("limit", "500");
    params.set("tx-type", "axfer");
    if (nextToken) params.set("next-token", nextToken);
    if (minRound && minRound > 0) params.set("min-round", String(minRound));

    const res = await fetch(`${ALGONODE_INDEXER}/accounts/${wallet}/transactions?${params.toString()}`);
    if (!res.ok) break;

    const data = await res.json();
    const transactions = data.transactions || [];
    if (transactions.length === 0) break;

    for (const tx of transactions) {
      const transfer = tx["asset-transfer-transaction"];
      if (transfer && Number(transfer["asset-id"]) === TOF_ASSET_ID) {
        let note = "";
        try { if (tx.note) note = atob(tx.note); } catch(e){}
        
        allTx.push({
          wallet, 
          username: username || null, 
          tx_id: tx.id,
          amount: Number(transfer.amount || 0) / 1000000,
          note, 
          category: note.toUpperCase().includes("NABUNG") ? "NABUNG_RECEH" : "DANA_MASUK",
          sender: tx.sender || null, 
          receiver: transfer.receiver || null,
          round: Number(tx["confirmed-round"] || tx["round-time"] || 0),
          created_at: tx["round-time"] ? new Date(Number(tx["round-time"]) * 1000).toISOString() : new Date().toISOString()
          // Field synced_at dihapus karena tidak ada di schema Supabase
        });
      }
    }

    nextToken = data["next-token"] || null;
  } while (nextToken);

  return allTx;
}

async function syncData() {
  const client = getSupabase();
  if (!client) {
    alert("Supabase belum terhubung!");
    return;
  }

  if (syncBtn) syncBtn.disabled = true;
  try {
    const wallets = await getAllWallets();
    let totalTx = 0;

    for (let i = 0; i < wallets.length; i++) {
      const u = wallets[i];
      const wallet = u.id;
      const username = u.username || wallet;

      setStatus(`🔄 Sync (${i + 1}/${wallets.length}): ${username}...`);

      const { data: syncState } = await client
        .from("tof_sync_state").select("last_round").eq("wallet", wallet).maybeSingle();

      const lastRound = Number(syncState?.last_round || 0);
      const minRound = lastRound > 0 ? lastRound + 1 : null;

      const txs = await fetchWalletTx(wallet, username, minRound);
      totalTx += txs.length;

      if (txs.length > 0) {
        await client.from("tof_history").upsert(txs, { onConflict: "tx_id" });
      }

      // Ambil balance
      const resBal = await fetch(`${ALGONODE_INDEXER}/accounts/${wallet}`);
      let balance = 0;
      if (resBal.ok) {
        const dataBal = await resBal.json();
        const tofAsset = (dataBal.account?.assets || []).find(a => Number(a["asset-id"]) === TOF_ASSET_ID);
        if (tofAsset) balance = Number(tofAsset.amount || 0) / 1000000;
      }

      await client.from("tof_balances").upsert({
        wallet, username: username || null, balance, updated_at: new Date().toISOString()
      }, { onConflict: "wallet" });

      const maxTxRound = txs.reduce((max, t) => t.round > max ? t.round : max, 0);
      const latestNodeRound = await getLatestNodeRound();
      const newLastRound = Math.max(lastRound, maxTxRound, latestNodeRound);

      await client.from("tof_sync_state").upsert({
        wallet, username: username || null, last_round: newLastRound,
        last_sync_at: new Date().toISOString(), sync_status: "SUCCESS"
      }, { onConflict: "wallet" });
    }

    setStatus(`✅ Sync Selesai! ${totalTx} transaksi baru diproses.`);
    await loadReport();
  } catch (err) {
    console.error(err);
    setStatus(`❌ Gagal Sync: ${err.message}`);
  } finally {
    if (syncBtn) syncBtn.disabled = false;
  }
}

// Inisialisasi setelah DOM selesai dimuat sepenuhnya
document.addEventListener("DOMContentLoaded", () => {
  if (syncBtn) syncBtn.addEventListener("click", syncData);
  loadReport();
});