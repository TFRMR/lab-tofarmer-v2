const TARGET_TOF = 100000;
const RATE = 0.10;

const container = document.getElementById("qlrContainer");

// Variabel state global untuk menyimpan data radar & status lipat
let globalUserList = [];
let isExpanded = false;

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
function createLine(username, months, balance, index) {
  const line = document.createElement("div");

  line.style = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    margin: 4px 0;
    font-size: 8px;
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

  // 2. KOLOM USERNAME INTERAKTIF (BISA DIKLIK KE PROFIL)
  const labelEl = document.createElement("div");
  labelEl.style = `
    flex: 1; 
    font-weight: 600; 
    color: #2f6f4e; 
    white-space: nowrap; 
    overflow: hidden; 
    text-overflow: ellipsis; 
    padding-right: 4px;
    cursor: pointer;
    transition: color 0.15s, text-decoration 0.15s;
  `;
  labelEl.innerText = "@" + username;

  labelEl.onclick = () => {
    window.location.assign(`profile.html?u=${username}`);
  };

  labelEl.onmouseover = () => {
    labelEl.style.color = "#16a34a";
    labelEl.style.textDecoration = "underline";
  };
  labelEl.onmouseout = () => {
    labelEl.style.color = "#2f6f4e";
    labelEl.style.textDecoration = "none";
  };

  // 3. KOLOM SALDO TOF
  const balanceEl = document.createElement("div");
  balanceEl.style = "width: 85px; text-align: right; font-weight: 700; color: #b5942b; flex-shrink: 0; font-variant-numeric: tabular-nums;";
  balanceEl.innerText = balance.toLocaleString("id-ID", { maximumFractionDigits: 0 }) + " TOF";

  // 4. KOLOM SISA WAKTU
  const timeEl = document.createElement("div");
  timeEl.style = "width: 65px; text-align: right; color: #6f7f76; flex-shrink: 0; font-size: 10px;";
  timeEl.innerText = "⏳ " + formatTime(months);

  line.appendChild(medalEl);
  line.appendChild(labelEl);
  line.appendChild(balanceEl);
  line.appendChild(timeEl);

  return line;
}

// ========================================================
// FUNGSI KHUSUS: MERENDER DATA BERDASARKAN KONDISI TOMBOL
// ========================================================
function drawRadarItems() {
  // Bersihkan penampung utama terlebih dahulu
  container.innerHTML = "";

  // Tentukan batas item: Ambil 5 jika dilipat, ambil semua jika dibuka
  const itemsToRender = isExpanded ? globalUserList : globalUserList.slice(0, 5);

  // Render baris data
  itemsToRender.forEach((user, index) => {
    const line = createLine(user.username, user.months, user.balance, index);
    container.appendChild(line);
  });

  // Jika total user lebih dari 5 orang, munculkan tombol ekspand di bawahnya
  if (globalUserList.length > 5) {
    const btnContainer = document.createElement("div");
    btnContainer.style = "text-align: center; margin-top: 10px; margin-bottom: 4px;";

    const toggleBtn = document.createElement("button");
    toggleBtn.style = `
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #16a34a;
      padding: 6px 14px;
      font-size: 9px;
      font-weight: 600;
      border-radius: 20px;
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      transition: all 0.2s ease;
      box-shadow: 0 1px 2px rgba(0,0,0,0.02);
    `;
    
    // Sesuaikan label teks tombol berdasarkan state
    toggleBtn.innerText = isExpanded ? "Ringkas Tampilan 🌾" : `Intip Seluruh Radar Ladang (${globalUserList.length} Warga) 🌿`;

    // Efek Hover Tombol
    toggleBtn.onmouseover = () => {
      toggleBtn.style.background = "#dcfce7";
      toggleBtn.style.transform = "scale(1.03)";
    };
    toggleBtn.onmouseout = () => {
      toggleBtn.style.background = "#f0fdf4";
      toggleBtn.style.transform = "scale(1)";
    };

    // Aksi klik untuk mengubah state pelipatan tanpa fetch ulang blockchain
    toggleBtn.onclick = () => {
      isExpanded = !isExpanded;
      drawRadarItems(); // Gambar ulang tampilannya saja
    };

    btnContainer.appendChild(toggleBtn);
    container.appendChild(btnContainer);
  }
}

// =========================
// AMBIL DATA AWAL RADAR
// =========================
async function renderQLR() {
  container.innerHTML = "<div style='font-size:11px; color:#6f7f76; text-align:center; padding:10px;'>Menghitung radar ladang... 🌿</div>";

  const users = await getAllWallets();
  globalUserList = []; // Reset ulang wadah data global

  // 1. Kumpulkan semua data saldo dari blockchain
  for (let u of users) {
    const balance = await getUserBalance(u.id);
    const months = calcMonths(balance);
    
    globalUserList.push({
      username: u.username || u.id,
      balance: balance,
      months: months
    });
  }

  // 2. URUTKAN: Saldo paling besar berada di urutan paling atas
  globalUserList.sort((a, b) => b.balance - a.balance);

  // 3. Jalankan fungsi render visual ke HTML
  drawRadarItems();
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