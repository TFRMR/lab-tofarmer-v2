const supabaseClient = window.supabaseClient;
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
// 1. SUPABASE READERS (SOLUSI CORS: SEQUENTIAL FETCH)
// ---------------------------------------------------------
async function getAllWallets() {
  let allProfiles = [], page = 0, size = 1000;
  while (true) {
    const { data, error } = await supabaseClient
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
  let allData = [], page = 0, size = 1000;
  while (true) {
    const { data, error } = await supabaseClient
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
  const { data, error } = await supabaseClient
    .from("tof_balances")
    .select("wallet, username, balance, updated_at");
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------
// 2. RENDER REPORT (MEMBACA DARI SUPABASE SAJA)
// ---------------------------------------------------------
async function loadReport() {
  setStatus("⚡ Memuat data dari Supabase...");
  try {
    const wallets = await getAllWallets();
    const history = await getHistoryFromSupabase();
    const balances = await getBalancesFromSupabase();

    const balanceMap = {};
    balances.forEach(b => { if (b.wallet) balanceMap[b.wallet] = Number(b.balance || 0); });

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

    let html = `<h3 style="margin-bottom:1.5rem; text-align:center;">👤 DETAIL KONTRIBUSI ANGGOTA</h3>`;
    for (const u of wallets) {
      const wallet = u.id;
      const txs = grouped[wallet] || [];
      const balance = Number(balanceMap[wallet] || 0);

      html += `
        <details class="card" style="margin-bottom:15px;">
          <summary style="cursor:pointer; font-weight:bold; color:#fde047; outline:none;">
            👤 ${u.username ? '@' + u.username : wallet}
            <span style="font-size:0.8rem; color:#64748b;">(${txs.length} transaksi)</span>
          </summary>
          <div style="margin-top:15px;">
            <table style="width:100%; font-size:0.9rem;">
              <tbody>`;
      
      if (txs.length === 0) {
        html += `<tr><td style="padding:10px; text-align:center; color:#64748b;">Belum ada catatan transaksi.</td></tr>`;
      } else {
        txs.forEach(tx => {
          const isReceiver = tx.receiver === wallet;
          const sign = isReceiver ? "+" : "-";
          const color = isReceiver ? "#4ade80" : "#f87171";
          const date = tx.created_at ? new Date(tx.created_at).toLocaleDateString() : "-";
          html += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding:8px 5px;">${date} <div style="font-size:0.7rem; color:#64748b;">${tx.note || "-"}</div></td>
              <td style="text-align:right; color:${color}; font-weight:bold;">${sign} ${Number(tx.amount || 0).toLocaleString()}</td>
            </tr>`;
        });
      }

      html += `
              </tbody>
              <tfoot>
                <tr style="border-top:2px solid #22c55e;">
                  <td style="padding:10px 5px; font-weight:bold;">SALDO</td>
                  <td style="padding:10px 5px; text-align:right; color:#fde047;">TOF ${balance.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </details>`;
    }

    if (feedEl) feedEl.innerHTML = html;
    setStatus(`⚡ Termuat ${wallets.length} profil.`);
  } catch (err) {
    console.error(err);
    setStatus(`❌ Error: ${err.message}`);
  }
}

// ---------------------------------------------------------
// 3. ALGONODE SYNC (SAFE PAGINATION & NO INFINITE LOOP)
// ---------------------------------------------------------
async function getLatestNodeRound() {
  try {
    const res = await fetch(`${ALGONODE_INDEXER}/health`);
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data.round || 0);
  } catch (e) { return 0; }
}

async function getWalletTxPage(wallet, nextToken = null, minRound = null) {
  const params = new URLSearchParams();
  params.set("limit", "1000");
  params.set("asset-id", String(TOF_ASSET_ID));
  if (nextToken) params.set("next-token", nextToken);
  if (minRound && minRound > 0) params.set("min-round", String(minRound));

  const res = await fetch(`${ALGONODE_INDEXER}/accounts/${wallet}/transactions?${params.toString()}`);
  if (!res.ok) {
    if (res.status === 404) return { transactions: [], nextToken: null };
    throw new Error(`Algonode error ${res.status}`);
  }
  const data = await res.json();
  return { transactions: data.transactions || [], nextToken: data["next-token"] || null };
}

async function fetchWalletTx(wallet, username, minRound = null) {
  let nextToken = null, allTx = [];
  do {
    const res = await getWalletTxPage(wallet, nextToken, minRound);
    if (!res.transactions || res.transactions.length === 0) break; // FIX BREAK LOOP

    for (const tx of res.transactions) {
      const transfer = tx["asset-transfer-transaction"];
      if (transfer && Number(transfer["asset-id"]) === TOF_ASSET_ID) {
        let note = "";
        try { if (tx.note) note = atob(tx.note); } catch(e){}
        allTx.push({
          wallet, username: username || null, tx_id: tx.id,
          amount: Number(transfer.amount || 0) / 1000000,
          note, category: note.toUpperCase().includes("NABUNG") ? "NABUNG_RECEH" : "DANA_MASUK",
          sender: tx.sender || null, receiver: transfer.receiver || null,
          round: Number(tx["confirmed-round"] || tx["round-time"] || 0),
          created_at: tx["round-time"] ? new Date(Number(tx["round-time"]) * 1000).toISOString() : null,
          synced_at: new Date().toISOString()
        });
      }
    }
    nextToken = res.nextToken;
  } while (nextToken);

  return allTx;
}

async function syncData() {
  if (syncBtn) syncBtn.disabled = true;
  try {
    const wallets = await getAllWallets();
    let totalTx = 0;

    for (let i = 0; i < wallets.length; i++) {
      const u = wallets[i];
      const wallet = u.id;
      const username = u.username || wallet;

      setStatus(`🔄 Sync (${i + 1}/${wallets.length}): ${username}...`);

      const { data: syncState } = await supabaseClient
        .from("tof_sync_state").select("last_round").eq("wallet", wallet).maybeSingle();

      const lastRound = Number(syncState?.last_round || 0);
      const minRound = lastRound > 0 ? lastRound + 1 : null;

      const txs = await fetchWalletTx(wallet, username, minRound);
      totalTx += txs.length;

      if (txs.length > 0) {
        await supabaseClient.from("tof_history").upsert(txs, { onConflict: "tx_id" });
      }

      // Ambil balance
      const resBal = await fetch(`${ALGONODE_INDEXER}/accounts/${wallet}`);
      let balance = 0;
      if (resBal.ok) {
        const dataBal = await resBal.json();
        const tofAsset = (dataBal.account?.assets || []).find(a => Number(a["asset-id"]) === TOF_ASSET_ID);
        if (tofAsset) balance = Number(tofAsset.amount || 0) / 1000000;
      }

      await supabaseClient.from("tof_balances").upsert({
        wallet, username: username || null, balance, updated_at: new Date().toISOString()
      }, { onConflict: "wallet" });

      const maxTxRound = txs.reduce((max, t) => t.round > max ? t.round : max, 0);
      const latestNodeRound = await getLatestNodeRound();
      const newLastRound = Math.max(lastRound, maxTxRound, latestNodeRound);

      await supabaseClient.from("tof_sync_state").upsert({
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

if (syncBtn) syncBtn.addEventListener("click", syncData);
loadReport();