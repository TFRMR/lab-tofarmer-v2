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
// 1. SUPABASE READERS
// ---------------------------------------------------------
async function getAllWallets() {
  const client = getSupabase();
  if (!client) throw new Error("Supabase Client belum siap");

  let allProfiles = [], page = 0, size = 1000;
  while (true) {
    const { data, error } = await client
      .from("profiles")
      .select("id, username, saldo_tof")
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
  if (!client) throw new Error("Supabase Client belum siap");

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

// ---------------------------------------------------------
// 2. RENDER REPORT (MATCHING SUPER ACCURATE)
// ---------------------------------------------------------
async function loadReport() {
  setStatus("⚡ Memuat data dari Supabase...");
  try {
    const wallets = await getAllWallets();
    const history = await getHistoryFromSupabase();

    let totalAll = 0;
    wallets.forEach(u => {
      totalAll += Number(u.saldo_tof || 0);
    });

    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="card" style="text-align:center;">
          <h2 style="color:#fde047;">📊 RINGKASAN EKOSISTEM</h2>
          <p style="font-size:1.2rem; font-weight:bold; margin-top:10px;">
            TOTAL: TOF ${totalAll.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 5 })}
          </p>
          <p style="font-size:0.8rem; color:#64748b;">SOURCE: ✅ SUPABASE</p>
        </div>`;
    }

    let html = `<h3 style="margin-bottom:1.5rem; text-align:center;">👤 KLIK KARTU UNTUK LHAT DETAIL TRANSAKSI SEMUA ANGGOTA (${wallets.length})</h3>`;
    
    wallets.forEach(u => {
      const walletAddress = (u.id || "").trim();
      const username = (u.username || "").trim();
      const balance = Number(u.saldo_tof || 0);

      const userKeys = [
        walletAddress.toLowerCase(),
        username.toLowerCase(),
        username ? `@${username.toLowerCase()}` : ""
      ].filter(Boolean);

      const displayName = username 
        ? `@${username}` 
        : (walletAddress ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}` : "Anonim");

      const txsRaw = history.filter(tx => {
        const fields = [
          tx.wallet,
          tx.username,
          tx.sender,
          tx.receiver
        ].filter(Boolean).map(v => String(v).trim().toLowerCase());

        return userKeys.some(k => fields.includes(k));
      });

      const uniqueTxMap = new Map();
      txsRaw.forEach(t => {
        const key = t.tx_id || `${t.created_at}_${t.amount}_${t.note}`;
        uniqueTxMap.set(key, t);
      });
      const txs = Array.from(uniqueTxMap.values());

      let txRows = "";
      if (txs.length === 0) {
        txRows = `<tr><td colspan="2" style="padding:12px; text-align:center; color:#64748b;">Belum ada catatan transaksi di database. Klik "Sync" untuk sinkronisasi.</td></tr>`;
      } else {
        txs.forEach(tx => {
          const sender = String(tx.sender || "").trim().toLowerCase();
          const receiver = String(tx.receiver || "").trim().toLowerCase();
          const txWallet = String(tx.wallet || "").trim().toLowerCase();

          const isReceiver = userKeys.includes(receiver) || (userKeys.includes(txWallet) && !userKeys.includes(sender));
          const sign = isReceiver ? "+" : "-";
          const color = isReceiver ? "#4ade80" : "#f87171";
          
          let dateStr = "-";
          if (tx.created_at) {
            const d = new Date(tx.created_at);
            if (!isNaN(d.getTime())) {
              dateStr = d.toLocaleDateString("id-ID", { day: 'numeric', month: 'numeric', year: 'numeric' });
            }
          }
          
          const noteText = tx.note ? tx.note.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "-";

          txRows += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding:10px 8px; vertical-align:top;">
                <div style="font-weight:600; color:#e2e8f0; font-size:0.85rem;">${dateStr}</div>
                <div style="font-size:0.75rem; color:#94a3b8; margin-top:3px; word-break:break-word;">${noteText}</div>
              </td>
              <td style="text-align:right; color:${color}; font-weight:bold; white-space:nowrap; vertical-align:top; padding:10px 8px;">
                ${sign} ${Number(tx.amount || 0).toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 5 })} TOF
              </td>
            </tr>`;
        });
      }

      html += `
        <details class="card" style="margin-bottom:15px;">
          <summary style="cursor:pointer; font-weight:bold; color:#fde047; outline:none; display:flex; justify-content:space-between; align-items:center;">
            <span>👤 ${displayName}</span>
            <span style="font-size:0.8rem; color:#64748b; font-weight:normal;">(${txs.length} transaksi)</span>
          </summary>
          <div style="margin-top:15px; overflow-x:auto;">
            <table style="width:100%; font-size:0.9rem; border-collapse:collapse;">
              <tbody>${txRows}</tbody>
              <tfoot>
                <tr style="border-top:2px solid #22c55e;">
                  <td style="padding:10px 8px; font-weight:bold;">SALDO SAAT INI</td>
                  <td style="padding:10px 8px; text-align:right; color:#fde047; font-weight:bold;">TOF ${balance.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 5 })}</td>
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
// 3. ALGONODE SYNC (FULL HISTORY RETRIEVAL)
// ---------------------------------------------------------
async function fetchWalletTx(wallet, username) {
  let nextToken = null, allTx = [];
  let safetyLoop = 0;

  if (!wallet || wallet.trim().length !== 58) {
    console.warn(`⚠️ Skip Sync Algonode: '${wallet}' bukan alamat wallet Algorand valid 58 karakter.`);
    return [];
  }

  do {
    safetyLoop++;
    if (safetyLoop > 50) break;

    const params = new URLSearchParams();
    params.set("limit", "500");
    params.set("tx-type", "axfer");
    params.set("asset-id", String(TOF_ASSET_ID));
    if (nextToken) params.set("next-token", nextToken);

    try {
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
          
          // SEMUA TOF MEMILIKI 6 DESIMAL (Selalu dibagi 1.000.000)
          const formattedAmount = Number(transfer.amount || 0) / 1000000;

          allTx.push({
            wallet: wallet, 
            username: username || null, 
            tx_id: tx.id,
            amount: formattedAmount,
            note: note, 
            category: note.toUpperCase().includes("NABUNG") ? "NABUNG_RECEH" : "DANA_MASUK",
            sender: tx.sender || null, 
            receiver: transfer.receiver || null,
            round: Number(tx["confirmed-round"] || tx["round-time"] || 0),
            created_at: tx["round-time"] ? new Date(Number(tx["round-time"]) * 1000).toISOString() : new Date().toISOString()
          });
        }
      }

      nextToken = data["next-token"] || null;
    } catch (e) {
      console.error("Error fetching transactions:", e);
      break;
    }
  } while (nextToken);

  // De-duplikasi berdasarkan tx_id agar tidak memicu error ON CONFLICT DO UPDATE di Supabase
  const uniqueMap = new Map();
  allTx.forEach(item => {
    if (item.tx_id && !uniqueMap.has(item.tx_id)) {
      uniqueMap.set(item.tx_id, item);
    }
  });

  return Array.from(uniqueMap.values());
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

      // Tarik seluruh riwayat tanpa terhalang minRound
      const txs = await fetchWalletTx(wallet, username);
      totalTx += txs.length;

      if (txs.length > 0) {
        const { error: upsertErr } = await client
          .from("tof_history")
          .upsert(txs, { onConflict: "tx_id" });

        if (upsertErr) {
          console.error(`❌ Gagal Upsert untuk ${username}:`, upsertErr.message, upsertErr.details);
        }
      }

      // Sync Saldo On-chain dari Indexer
      try {
        const resBal = await fetch(`${ALGONODE_INDEXER}/accounts/${wallet}`);
        if (resBal.ok) {
          const dataBal = await resBal.json();
          const tofAsset = (dataBal.account?.assets || []).find(a => Number(a["asset-id"]) === TOF_ASSET_ID);
          if (tofAsset) {
            const balance = Number(tofAsset.amount || 0) / 1000000;
            await client.from("profiles").update({ saldo_tof: balance }).eq("id", wallet);
          }
        }
      } catch (e) {
        console.error("Gagal update saldo wallet:", wallet, e);
      }
    }

    setStatus(`✅ Sync Selesai! ${totalTx} transaksi berhasil diperbarui.`);
    await loadReport();
  } catch (err) {
    console.error(err);
    setStatus(`❌ Gagal Sync: ${err.message}`);
  } finally {
    if (syncBtn) syncBtn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (syncBtn) syncBtn.addEventListener("click", syncData);
  loadReport();
});