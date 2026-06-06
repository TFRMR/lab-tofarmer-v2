const TARGET_TOF = 100000;
const RATE = 0.10;

const container = document.getElementById("qlrContainer");

// =========================
// ambil semua wallet
// =========================
async function getAllWallets() {
  const { data } = await supabaseClient
    .from("profiles")
    .select("id, username");

  return data || [];
}

// =========================
// ambil saldo REAL blockchain (SAMA SEPERTI TRANSPARANSI)
// =========================
async function getUserBalance(wallet) {
  try {
    if (!wallet) return 0;

    const url =
      `https://mainnet-idx.algonode.cloud/v2/accounts/${wallet}`;

    const res = await fetch(url);
    const data = await res.json();

    const assets = data.account?.assets || [];

    const target = assets.find(
      a => Number(a["asset-id"]) === 3558306283
    );

    if (!target) return 0;

    return Number(target.amount || 0) / 1e6;

  } catch (e) {
    return 0;
  }
}
// =========================
// hitung bulan menuju target (compounding 10%)
// =========================
function calcMonths(pv) {
  if (pv <= 0) return Infinity;

  const n = Math.log(TARGET_TOF / pv) / Math.log(1 + RATE);
  return Math.ceil(n);
}

// =========================
// hitung progress bar posisi dot (0 - 100%)
// =========================
function calcProgress(pv) {
  if (!pv || pv <= 0) return 0;

  const ratio = pv / TARGET_TOF;
  return Math.min(100, ratio * 100);
}
function formatTime(months) {
  if (!isFinite(months)) return "∞";

  const years = Math.floor(months / 12);
  const remMonths = months % 12;

  if (years <= 0) {
    return `${remMonths} bln`;
  }

  if (remMonths === 0) {
    return `${years} thn`;
  }

  return `${years} thn ${remMonths} bln`;
}
// =========================
// garis per user (TOF FARMER RADAR STYLE)
// =========================
// Tambahkan parameter 'index' dan 'balance' untuk menampilkan nomor dan jumlah saldo
function createLine(username, months, balance, index) {
  const line = document.createElement("div");

  // Style container baris agar padat dan rapi
  line.style = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    margin: 4px 0;
    font-size: 11px;
    font-family: 'Inter', sans-serif;
    background: rgba(248, 250, 249, 0.6);
    border-radius: 8px;
    border: 1px solid rgba(0,0,0,0.02);
  `;

  // 1. KOLOM MEDALI / NOMOR URUT
  let medali = `${index + 1}.`;
  if (index === 0) medali = "🥇";
  if (index === 1) medali = "🥈";
  if (index === 2) medali = "🥉";

  const medalEl = document.createElement("div");
  medalEl.style = "width: 22px; font-weight: bold; flex-shrink: 0;";
  medalEl.innerText = medali;

  // 2. KOLOM USERNAME
  const labelEl = document.createElement("div");
  labelEl.style = "flex: 1; font-weight: 600; color: #2f6f4e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 4px;";
  labelEl.innerText = "@" + username;

  // 3. KOLOM SALDO TOF (Format ribuan ala Indonesia)
  const balanceEl = document.createElement("div");
  balanceEl.style = "width: 85px; text-align: right; font-weight: 700; color: #b5942b; flex-shrink: 0; font-variant-numeric: tabular-nums;";
  balanceEl.innerText = balance.toLocaleString("id-ID", { maximumFractionDigits: 0 }) + " TOF";

  // 4. KOLOM SISA WAKTU (ESTIMASI COMOUNDING)
  const timeEl = document.createElement("div");
  timeEl.style = "width: 65px; text-align: right; color: #6f7f76; flex-shrink: 0; font-size: 10px;";
  timeEl.innerText = "⏳ " + formatTime(months);

  // Masukkan semua kolom ke dalam baris
  line.appendChild(medalEl);
  line.appendChild(labelEl);
  line.appendChild(balanceEl);
  line.appendChild(timeEl);

  return line;
}

// =========================
// render radar
// =========================
async function renderQLR() {
  container.innerHTML = "<div style='font-size:11px; color:#6f7f76; text-align:center; padding:10px;'>Menghitung radar ladang... 🌿</div>";

  const users = await getAllWallets();
  const userListWithBalance = [];

  // 1. Kumpulkan semua data saldo dari blockchain terlebih dahulu
  for (let u of users) {
    const balance = await getUserBalance(u.id);
    const months = calcMonths(balance);
    
    userListWithBalance.push({
      username: u.username || u.id,
      balance: balance,
      months: months
    });
  }

  // 2. URUTKAN: Saldo paling besar berada di urutan paling atas
  userListWithBalance.sort((a, b) => b.balance - a.balance);

  // Bersihkan teks loading sebelum render data asli
  container.innerHTML = "";

  // 3. Render data yang sudah urut ke dalam card container
  userListWithBalance.forEach((user, index) => {
    const line = createLine(
      user.username,
      user.months,
      user.balance,
      index // Berikan posisi index untuk penentuan medali
    );
    container.appendChild(line);
  });
}

// =========================
// STYLE GLOBAL (TOF FARMER VIBES)
// =========================
const style = document.createElement("style");
style.innerHTML = `
@keyframes moveDot {
  0% { transform: translateX(0px); }
  50% { transform: translateX(120px); }
  100% { transform: translateX(0px); }
}

@keyframes dotBreath {
  0% { transform: translateX(-50%) scale(1); }
  50% { transform: translateX(-50%) scale(1.4); }
  100% { transform: translateX(-50%) scale(1); }
}

@keyframes pulseGlow {
  0% { opacity:0.2; }
  50% { opacity:0.6; }
  100% { opacity:0.2; }
}
`;
document.head.appendChild(style);

// RUN
renderQLR();