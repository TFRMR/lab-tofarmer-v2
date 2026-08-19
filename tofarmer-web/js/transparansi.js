const supabaseClient = window.supabaseClient;

const TOF_ASSET_ID = 3558306283;
const ALGONODE_INDEXER =
  "https://mainnet-idx.algonode.cloud/v2";

const summaryEl = document.getElementById("summary");
const feedEl = document.getElementById("feed");
const statusEl = document.getElementById("status");
const syncBtn = document.getElementById("syncBtn");


// =========================================================
// 1. AMBIL SEMUA WALLET USER
// =========================================================

async function getAllWallets() {

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username");

  if (error) {
    console.error("Gagal mengambil profiles:", error);
    throw error;
  }

  return data || [];
}


// =========================================================
// 2. DECODE NOTE
// =========================================================

function decodeNote(note) {

  if (!note) return "";

  try {

    return atob(note);

  } catch (error) {

    return "";

  }
}


// =========================================================
// 3. KATEGORI TRANSAKSI
// =========================================================

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


// =========================================================
// 4. KONVERSI TRANSAKSI ALGORAND → DATA SUPABASE
// =========================================================

function normalizeTransaction(tx, wallet, username) {

  const transfer =
    tx["asset-transfer-transaction"];

  if (!transfer) {
    return null;
  }

  const assetId =
    transfer["asset-id"];

  if (assetId !== TOF_ASSET_ID) {
    return null;
  }

  const amountRaw =
    Number(transfer.amount || 0);

  const amount =
    amountRaw / 1000000;

  const note =
    decodeNote(tx.note);

  return {

    wallet: wallet,

    username: username || null,

    tx_id: tx.id,

    amount: amount,

    note: note,

    category: categorize(note),

    sender: tx.sender || null,

    receiver: transfer.receiver || null,

    round: Number(tx["confirmed-round"] || tx["round-time"] || 0),

    created_at:
      tx["round-time"]
        ? new Date(
            Number(tx["round-time"]) * 1000
          ).toISOString()
        : null,

    synced_at: new Date().toISOString()
  };
}


// =========================================================
// 5. AMBIL TRANSAKSI DARI ALGO NODE
//
// PENTING:
// Fungsi ini menggunakan PAGINATION.
// Jadi seluruh histori dapat diambil.
// =========================================================

async function getWalletTxPage(
  wallet,
  nextToken = null,
  minRound = null
) {

  const params =
    new URLSearchParams();

  params.set("limit", "1000");

  if (nextToken) {

    params.set(
      "next-token",
      nextToken
    );
  }

  if (
    minRound !== null &&
    minRound !== undefined &&
    minRound > 0
  ) {

    params.set(
      "min-round",
      String(minRound)
    );
  }

  const url =
    `${ALGONODE_INDEXER}/accounts/${wallet}/transactions?${params.toString()}`;

  const response =
    await fetch(url);

  if (!response.ok) {

    throw new Error(
      `Algonode error ${response.status}: ${response.statusText}`
    );
  }

  const data =
    await response.json();

  return {

    transactions:
      data.transactions || [],

    nextToken:
      data["next-token"] || null
  };
}


// =========================================================
// 6. AMBIL SEMUA TRANSAKSI
//
// Digunakan untuk FIRST FULL SYNC.
// =========================================================

async function getAllWalletTransactions(
  wallet,
  username,
  onProgress = null
) {

  let nextToken = null;

  let allTransactions = [];

  let page = 0;

  do {

    page++;

    const result =
      await getWalletTxPage(
        wallet,
        nextToken,
        null
      );

    const transactions =
      result.transactions;

    for (const tx of transactions) {

      const normalized =
        normalizeTransaction(
          tx,
          wallet,
          username
        );

      if (normalized) {

        allTransactions.push(
          normalized
        );
      }
    }

    nextToken =
      result.nextToken;

    if (onProgress) {

      onProgress({
        page,
        count:
          allTransactions.length
      });
    }

  } while (nextToken);

  return allTransactions;
}


// =========================================================
// 7. AMBIL TRANSAKSI BARU
//
// Setelah FULL SYNC selesai,
// sinkronisasi berikutnya dimulai dari round terakhir.
// =========================================================

async function getNewWalletTransactions(
  wallet,
  username,
  lastRound
) {

  let nextToken = null;

  let allTransactions = [];

  do {

    const result =
      await getWalletTxPage(
        wallet,
        nextToken,
        lastRound
      );

    for (
      const tx of result.transactions
    ) {

      const normalized =
        normalizeTransaction(
          tx,
          wallet,
          username
        );

      if (normalized) {

        allTransactions.push(
          normalized
        );
      }
    }

    nextToken =
      result.nextToken;

  } while (nextToken);

  return allTransactions;
}


// =========================================================
// 8. SIMPAN TRANSAKSI KE SUPABASE
//
// Batch supaya tidak melakukan INSERT satu per satu.
// =========================================================

async function saveTransactions(
  transactions
) {

  if (!transactions.length) {

    return;
  }

  const batchSize = 500;

  for (
    let i = 0;
    i < transactions.length;
    i += batchSize
  ) {

    const batch =
      transactions.slice(
        i,
        i + batchSize
      );

    const { error } =
      await supabaseClient
        .from("tof_history")
        .upsert(
          batch,
          {
            onConflict: "tx_id"
          }
        );

    if (error) {

      console.error(
        "Gagal menyimpan transaksi:",
        error
      );

      throw error;
    }
  }
}


// =========================================================
// 9. AMBIL BALANCE WALLET DARI ALGO NODE
// =========================================================

async function getWalletBalance(
  wallet
) {

  const url =
    `${ALGONODE_INDEXER}/accounts/${wallet}`;

  const response =
    await fetch(url);

  if (!response.ok) {

    throw new Error(
      `Gagal mengambil balance ${wallet}`
    );
  }

  const data =
    await response.json();

  const assets =
    data.account?.assets || [];

  const tof =
    assets.find(
      asset =>
        Number(asset["asset-id"]) ===
        TOF_ASSET_ID
    );

  if (!tof) {

    return 0;
  }

  return (
    Number(tof.amount || 0) /
    1000000
  );
}


// =========================================================
// 10. SIMPAN BALANCE KE SUPABASE
// =========================================================

async function saveWalletBalance(
  wallet,
  username,
  balance
) {

  const { error } =
    await supabaseClient
      .from("tof_balances")
      .upsert(
        {
          wallet: wallet,

          username:
            username || null,

          balance: balance,

          updated_at:
            new Date().toISOString()
        },
        {
          onConflict: "wallet"
        }
      );

  if (error) {

    console.error(
      "Gagal menyimpan balance:",
      error
    );

    throw error;
  }
}


// =========================================================
// 11. AMBIL STATUS SYNC
// =========================================================

async function getSyncState(
  wallet
) {

  const { data, error } =
    await supabaseClient
      .from("tof_sync_state")
      .select("*")
      .eq("wallet", wallet)
      .maybeSingle();

  if (error) {

    console.error(
      "Gagal mengambil sync state:",
      error
    );

    throw error;
  }

  return data;
}


// =========================================================
// 12. SIMPAN STATUS SYNC
// =========================================================

async function saveSyncState(
  wallet,
  username,
  lastRound,
  status,
  errorMessage = null
) {

  const { error } =
    await supabaseClient
      .from("tof_sync_state")
      .upsert(
        {
          wallet: wallet,

          username:
            username || null,

          last_round:
            Number(lastRound || 0),

          last_sync_at:
            new Date().toISOString(),

          sync_status:
            status,

          sync_error:
            errorMessage
        },
        {
          onConflict: "wallet"
        }
      );

  if (error) {

    console.error(
      "Gagal menyimpan sync state:",
      error
    );

    throw error;
  }
}


// =========================================================
// 13. CARI ROUND TERBESAR
// =========================================================

function getHighestRound(
  transactions
) {

  let highest = 0;

  for (
    const tx of transactions
  ) {

    const round =
      Number(tx.round || 0);

    if (round > highest) {

      highest = round;
    }
  }

  return highest;
}


// =========================================================
// 14. FULL SYNC SATU WALLET
//
// Ini untuk pertama kali.
// SEMUA histori diambil.
// =========================================================

async function fullSyncWallet(
  wallet,
  username,
  walletIndex,
  totalWallet
) {

  console.log(
    `[FULL SYNC] ${username} ${wallet}`
  );

  await saveSyncState(
    wallet,
    username,
    0,
    "SYNCING",
    null
  );

  setStatus(
    `🔄 FULL SYNC ${walletIndex}/${totalWallet}: ${username} — mengambil seluruh histori...`
  );

  const transactions =
    await getAllWalletTransactions(
      wallet,
      username,
      progress => {

        setStatus(
          `🔄 FULL SYNC ${walletIndex}/${totalWallet}: ${username} — halaman ${progress.page}, ${progress.count} transaksi TOF`
        );
      }
    );

  console.log(
    `FULL SYNC ${username}:`,
    transactions.length,
    "transaksi"
  );

  // Simpan semua transaksi
  await saveTransactions(
    transactions
  );

  setStatus(
    `💾 ${username}: ${transactions.length} transaksi tersimpan. Mengambil saldo...`
  );

  // Ambil saldo terbaru
  const balance =
    await getWalletBalance(wallet);

  await saveWalletBalance(
    wallet,
    username,
    balance
  );

  // Cari round tertinggi
  const highestRound =
    getHighestRound(
      transactions
    );

  await saveSyncState(
    wallet,
    username,
    highestRound,
    "SUCCESS",
    null
  );

  return {

    transactionCount:
      transactions.length,

    balance:
      balance,

    lastRound:
      highestRound
  };
}


// =========================================================
// 15. INCREMENTAL SYNC SATU WALLET
//
// Ini dipakai setelah FULL SYNC.
// =========================================================

async function incrementalSyncWallet(
  wallet,
  username,
  walletIndex,
  totalWallet
) {

  const state =
    await getSyncState(wallet);

  const lastRound =
    Number(
      state?.last_round || 0
    );

  // Kalau belum pernah full sync,
  // otomatis jalankan FULL SYNC.
  if (!state || lastRound <= 0) {

    return await fullSyncWallet(
      wallet,
      username,
      walletIndex,
      totalWallet
    );
  }

  console.log(
    `[INCREMENTAL] ${username}, mulai round ${lastRound}`
  );

  await saveSyncState(
    wallet,
    username,
    lastRound,
    "SYNCING",
    null
  );

  setStatus(
    `🔄 SYNC ${walletIndex}/${totalWallet}: ${username} — mencari transaksi baru...`
  );

  const transactions =
    await getNewWalletTransactions(
      wallet,
      username,
      lastRound
    );

  console.log(
    `NEW ${username}:`,
    transactions.length,
    "transaksi"
  );

  // Simpan transaksi baru
  await saveTransactions(
    transactions
  );

  // Balance selalu diperbarui
  const balance =
    await getWalletBalance(wallet);

  await saveWalletBalance(
    wallet,
    username,
    balance
  );

  const highestRound =
    getHighestRound(
      transactions
    );

  // Kalau tidak ada transaksi baru,
  // tetap pertahankan lastRound lama.
  const newLastRound =
    Math.max(
      lastRound,
      highestRound
    );

  await saveSyncState(
    wallet,
    username,
    newLastRound,
    "SUCCESS",
    null
  );

  return {

    transactionCount:
      transactions.length,

    balance:
      balance,

    lastRound:
      newLastRound
  };
}


// =========================================================
// 16. DETEKSI APAKAH SUDAH PERNAH FULL SYNC
// =========================================================

async function isFirstSync() {

  const { data, error } =
    await supabaseClient
      .from("tof_sync_state")
      .select("wallet, last_round");

  if (error) {

    throw error;
  }

  if (!data || data.length === 0) {

    return true;
  }

  return data.some(
    row =>
      Number(row.last_round || 0) <= 0
  );
}


// =========================================================
// 17. SYNC SEMUA WALLET
// =========================================================

async function syncData() {

  if (syncBtn) {

    syncBtn.disabled = true;
  }

  try {

    const wallets =
      await getAllWallets();

    if (!wallets.length) {

      throw new Error(
        "Tidak ada wallet di profiles."
      );
    }

    const firstSync =
      await isFirstSync();

    console.log(
      "FIRST SYNC:",
      firstSync
    );

    if (firstSync) {

      setStatus(
        "🚀 FIRST SYNC: mengambil seluruh histori blockchain..."
      );

    } else {

      setStatus(
        "🔄 Incremental Sync: mencari data blockchain terbaru..."
      );
    }

    let totalTransactions = 0;

    let totalBalance = 0;

    for (
      let i = 0;
      i < wallets.length;
      i++
    ) {

      const user =
        wallets[i];

      const wallet =
        user.id;

      const username =
        user.username || wallet;

      try {

        let result;

        if (firstSync) {

          result =
            await fullSyncWallet(
              wallet,
              username,
              i + 1,
              wallets.length
            );

        } else {

          result =
            await incrementalSyncWallet(
              wallet,
              username,
              i + 1,
              wallets.length
            );
        }

        totalTransactions +=
          result.transactionCount;

        totalBalance +=
          result.balance;

      } catch (walletError) {

        console.error(
          `Sync wallet ${wallet} gagal:`,
          walletError
        );

        await saveSyncState(
          wallet,
          username,
          0,
          "ERROR",
          walletError.message
        );

        // Jangan menghentikan semua wallet
        // hanya karena satu wallet gagal.
        setStatus(
          `⚠️ ${username} gagal: ${walletError.message}`
        );
      }
    }

    setStatus(
      `✅ Sync selesai. ${totalTransactions} transaksi diproses. Total saldo TOF: ${totalBalance.toLocaleString()}`
    );

    // Setelah sync selesai,
    // LOAD DARI SUPABASE.
    await loadReport();

  } catch (error) {

    console.error(
      "SYNC ERROR:",
      error
    );

    setStatus(
      `❌ Gagal sync: ${error.message}`
    );

  } finally {

    if (syncBtn) {

      syncBtn.disabled = false;
    }
  }
}


// =========================================================
// 18. AMBIL SEMUA DATA HISTORY DARI SUPABASE
//
// TIDAK ADA ALGONODE DI SINI.
// =========================================================

async function getHistoryFromSupabase() {

  const pageSize = 1000;

  let from = 0;

  let allData = [];

  while (true) {

    const to =
      from + pageSize - 1;

    const { data, error } =
      await supabaseClient
        .from("tof_history")
        .select(`
          wallet,
          username,
          tx_id,
          amount,
          note,
          category,
          sender,
          receiver,
          round,
          created_at
        `)
        .order(
          "created_at",
          {
            ascending: false
          }
        )
        .range(from, to);

    if (error) {

      console.error(
        "Gagal load history:",
        error
      );

      throw error;
    }

    if (!data || data.length === 0) {

      break;
    }

    allData.push(
      ...data
    );

    if (data.length < pageSize) {

      break;
    }

    from += pageSize;
  }

  return allData;
}


// =========================================================
// 19. AMBIL BALANCE DARI SUPABASE
//
// INI TIDAK LAGI HIT ALGO NODE.
// =========================================================

async function getBalancesFromSupabase() {

  const { data, error } =
    await supabaseClient
      .from("tof_balances")
      .select(
        "wallet, username, balance, updated_at"
      );

  if (error) {

    console.error(
      "Gagal load balance:",
      error
    );

    throw error;
  }

  return data || [];
}


// =========================================================
// 20. GROUPING USER
// =========================================================

function groupByUser(data) {

  const grouped = {};

  data.forEach(tx => {

    const user =
      tx.username ||
      tx.wallet;

    if (!grouped[user]) {

      grouped[user] = {

        txs: [],

        wallet:
          tx.wallet
      };
    }

    grouped[user].txs.push(tx);

  });

  return grouped;
}


// =========================================================
// 21. FORMAT LABEL
// =========================================================

function getCategoryLabel(
  category
) {

  if (
    category ===
    "NABUNG_RECEH"
  ) {

    return "SETOR NABUNG RECEH";
  }

  if (
    category ===
    "REWARD"
  ) {

    return "REWARD";
  }

  if (
    category ===
    "DONASI"
  ) {

    return "DONASI";
  }

  if (
    category ===
    "LIQUIDITAS"
  ) {

    return "LIQUIDITAS";
  }

  if (
    category ===
    "TRANSAKSI"
  ) {

    return "TRANSAKSI";
  }

  return "DANA MASUK / KELUAR";
}


// =========================================================
// 22. FORMAT BARIS
// =========================================================

function formatRow(tx) {

  const d =
    new Date(
      tx.created_at
    );

  const date =
    d.toLocaleDateString();

  const time =
    d.toLocaleTimeString();

  const type =
    tx.category ||
    "DANA_MASUK";

  const label =
    getCategoryLabel(type);

  return `${date} | ${time} | TOF ${Number(tx.amount || 0).toLocaleString()} | ${label}`;
}


// =========================================================
// 23. LOAD REPORT
//
// PENTING:
// Fungsi ini SEKARANG HANYA membaca SUPABASE.
// Tidak ada fetch Algonode.
// =========================================================

async function loadReport() {

  setStatus(
    "⚡ Memuat data dari Supabase..."
  );

  try {

    // =====================================================
    // Ambil dua sumber dari Supabase secara paralel
    // =====================================================

    const [
      wallets,
      history,
      balances
    ] = await Promise.all([

      getAllWallets(),

      getHistoryFromSupabase(),

      getBalancesFromSupabase()

    ]);

    console.log(
      "WALLETS:",
      wallets.length
    );

    console.log(
      "HISTORY:",
      history.length
    );

    console.log(
      "BALANCES:",
      balances.length
    );


    // =====================================================
    // Mapping balance berdasarkan wallet
    // =====================================================

    const balanceMap = {};

    balances.forEach(row => {

      balanceMap[row.wallet] =
        Number(row.balance || 0);

    });


    // =====================================================
    // Group history berdasarkan user
    // =====================================================

    const grouped =
      groupByUser(history);


    // =====================================================
    // Bersihkan tampilan lama
    // =====================================================

    if (summaryEl) {

      summaryEl.innerHTML = "";
    }

    if (feedEl) {

      feedEl.innerHTML = "";
    }


    // =====================================================
    // Total semua balance
    // =====================================================

    let totalAll = 0;

    wallets.forEach(user => {

      totalAll +=
        Number(
          balanceMap[user.id] || 0
        );

    });


    // =====================================================
    // SUMMARY
    // =====================================================

    if (summaryEl) {

      summaryEl.innerHTML = `

        <div
          class="card"
          style="text-align:center;"
        >

          <h2 style="color:#fde047;">
            📊 RINGKASAN EKOSISTEM
          </h2>

          <p
            style="
              font-size:1.2rem;
              font-weight:bold;
              margin-top:10px;
            "
          >
            TOTAL: TOF
            ${totalAll.toLocaleString()}
          </p>

          <p
            style="
              font-size:0.8rem;
              color:#64748b;
            "
          >
            SOURCE:
            ✅ SUPABASE
          </p>

          <p
            style="
              font-size:0.75rem;
              color:#64748b;
            "
          >
            Blockchain → Supabase → Website
          </p>

        </div>

      `;
    }


    // =====================================================
    // HEADER
    // =====================================================

    let html = `

      <h3
        style="
          margin-bottom:1.5rem;
          text-align:center;
        "
      >
        👤 DETAIL KONTRIBUSI ANGGOTA
      </h3>

    `;


    // =====================================================
    // RENDER SETIAP USER
    // =====================================================

    for (
      const user of wallets
    ) {

      const wallet =
        user.id;

      const username =
        user.username ||
        wallet;

      const txs =
        grouped[username]?.txs ||
        grouped[wallet]?.txs ||
        [];

      const balance =
        Number(
          balanceMap[wallet] || 0
        );


      // ===================================================
      // CARD USER
      // ===================================================

      html += `

        <details
          class="card"
          style="
            margin-bottom:15px;
            border-left:3px solid #22c55e;
          "
        >

          <summary
            style="
              cursor:pointer;
              font-weight:bold;
              color:#fde047;
              outline:none;
            "
          >

            👤 ${username}

            <span
              style="
                font-size:0.8rem;
                color:#64748b;
                font-weight:normal;
              "
            >
              (${txs.length} transaksi —
              klik lihat detail)
            </span>

          </summary>

          <div
            style="margin-top:15px;"
          >

            <table
              style="
                width:100%;
                border-collapse:collapse;
                font-size:0.9rem;
              "
            >

              <thead>

                <tr
                  style="
                    color:#64748b;
                    border-bottom:1px solid #334155;
                  "
                >

                  <th
                    style="padding:5px;"
                  >
                    Tanggal
                  </th>

                  <th
                    style="
                      padding:5px;
                      text-align:right;
                    "
                  >
                    Jumlah
                  </th>

                </tr>

              </thead>

              <tbody>

      `;


      // ===================================================
      // TRANSAKSI USER
      // ===================================================

      txs.forEach(tx => {

        const amount =
          Number(
            tx.amount || 0
          );

        // Tentukan arah transaksi
        const isReceiver =
          tx.receiver === wallet;

        const isSender =
          tx.sender === wallet;

        const sign =
          isReceiver
            ? "+"
            : (
              isSender
                ? "-"
                : ""
            );

        const color =
          isReceiver
            ? "#4ade80"
            : (
              isSender
                ? "#f87171"
                : "#64748b"
            );

        const date =
          tx.created_at
            ? new Date(
                tx.created_at
              ).toLocaleDateString()
            : "-";

        const note =
          tx.note ||
          "-";

        html += `

          <tr
            style="
              border-bottom:
                1px solid
                rgba(255,255,255,0.05);
            "
          >

            <td
              style="padding:8px 5px;"
            >

              ${date}

              <div
                style="
                  font-size:0.7rem;
                  color:#64748b;
                "
              >

                ${note}

              </div>

            </td>

            <td
              style="
                text-align:right;
                color:${color};
                font-weight:bold;
              "
            >

              ${sign}
              ${amount.toLocaleString(
                undefined,
                {
                  minimumFractionDigits: 0
                }
              )}

            </td>

          </tr>

        `;
      });


      // ===================================================
      // FOOTER SALDO
      // ===================================================

      html += `

              </tbody>

              <tfoot>

                <tr
                  style="
                    border-top:2px solid #22c55e;
                  "
                >

                  <td
                    style="
                      padding:10px 5px;
                      font-weight:bold;
                    "
                  >
                    SALDO
                  </td>

                  <td
                    style="
                      padding:10px 5px;
                      text-align:right;
                      color:#fde047;
                    "
                  >

                    TOF
                    ${balance.toLocaleString()}

                  </td>

                </tr>

              </tfoot>

            </table>

          </div>

        </details>

      `;
    }


    // =====================================================
    // TAMPILKAN
    // =====================================================

    if (feedEl) {

      feedEl.innerHTML =
        html;
    }

    setStatus(
      `⚡ ${history.length.toLocaleString()} transaksi dimuat dari Supabase`
    );

  } catch (error) {

    console.error(
      "LOAD REPORT ERROR:",
      error
    );

    setStatus(
      `❌ Gagal memuat data: ${error.message}`
    );
  }
}


// =========================================================
// 24. STATUS HELPER
// =========================================================

function setStatus(message) {

  if (statusEl) {

    statusEl.innerText =
      message;
  }

  console.log(
    message
  );
}


// =========================================================
// 25. EVENT BUTTON
// =========================================================

if (syncBtn) {

  syncBtn.addEventListener(
    "click",
    syncData
  );
}


// =========================================================
// 26. AUTO LOAD
//
// INI SANGAT PENTING:
//
// Ketika halaman dibuka,
// TIDAK memanggil Algonode.
//
// Hanya:
// Supabase → Website
// =========================================================

loadReport();