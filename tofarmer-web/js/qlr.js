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
function createLine(username, months, progress) {

  const line = document.createElement("div");

  line.style = `
    display:flex;
    align-items:center;
    gap:10px;
    margin:5px 0;
    font-size:11px;
    font-family:Inter, sans-serif;
  `;

  // USER LABEL
  const label = document.createElement("div");
  label.style = `
    width:95px;
    font-weight:600;
    color:#2f6f4e;
  `;
  label.innerText = "@" + username;

  // TRACK LINE
  const track = document.createElement("div");
  track.style = `
    flex:1;
    height:2px;
    background:linear-gradient(90deg,
      rgba(76,175,122,0.15),
      rgba(201,162,39,0.10));
    border-radius:10px;
    position:relative;
    overflow:hidden;
  `;

  // GLOW PULSE BACKGROUND (radar feel)
  const glow = document.createElement("div");
  glow.style = `
    position:absolute;
    top:0;
    left:0;
    height:100%;
    width:100%;
    background:radial-gradient(circle,
      rgba(76,175,122,0.15),
      transparent);
    animation:pulseGlow 2.5s infinite ease-in-out;
  `;

  // DOT (POSITION BASED PROGRESS)
  const dot = document.createElement("div");
  dot.style = `
    width:8px;
    height:8px;
    border-radius:50%;
    background:#c9a227;
    position:absolute;
    top:-3px;
    left:${progress}%;
    transform:translateX(-50%);
    box-shadow:
      0 0 8px rgba(201,162,39,0.7),
      0 0 18px rgba(76,175,122,0.3);
    animation:dotBreath 1.8s infinite ease-in-out;
  `;

  track.appendChild(glow);
  track.appendChild(dot);

  // TEXT (ESTIMASI)
  const text = document.createElement("div");
  text.style = `
    width:80px;
    text-align:right;
    font-size:10px;
    color:#6f7f76;
  `;

  text.innerText = formatTime(months);

  line.appendChild(label);
  line.appendChild(track);
  line.appendChild(text);

  return line;
}

// =========================
// render radar
// =========================
async function renderQLR() {

  container.innerHTML = "";

  const users = await getAllWallets();

  for (let u of users) {

    const balance = await getUserBalance(u.id);

    const months = calcMonths(balance);
    const progress = calcProgress(balance);

    const line = createLine(
      u.username || u.id,
      months,
      progress
    );

    container.appendChild(line);
  }
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