const API = "https://tofarmer-api.tofarmer-api.workers.dev";

async function loadProfile() {
  const res = await fetch(`${API}/profiles`);
  const data = await res.json();

  const me = data[0]; // sementara ambil user pertama

  document.getElementById("profile").innerHTML = `
    <div class="card">
      <h2>${me.username}</h2>
      <p>🏆 Rank: ${me.rank}</p>
      <p>⭐ Level: ${me.level}</p>
      <p>🔥 XP: ${me.xp}</p>
      <p>💰 TOF: ${me.saldo_tof}</p>
    </div>
  `;
}

loadProfile();