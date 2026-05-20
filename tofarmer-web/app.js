const API = "https://tofarmer-api.tofarmer-api.workers.dev";

async function loadProfiles() {
  const feed = document.getElementById("feed");

  try {
    const res = await fetch(`${API}/profiles`);

    if (!res.ok) {
      throw new Error("HTTP Error " + res.status);
    }

    const data = await res.json();

    feed.innerHTML = "";

    data.forEach(user => {
      const card = document.createElement("div");
      card.className = "card";

      card.innerHTML = `
        <h3>${user.username}</h3>
        <p>🏆 Rank: ${user.rank}</p>
        <p>⭐ Level: ${user.level}</p>
        <p>💰 TOF: ${user.saldo_tof}</p>
      `;

      feed.appendChild(card);
    });

  } catch (err) {
    console.log("ERROR:", err);
    feed.innerHTML = "❌ Gagal load data (API tidak respon)";
  }
}

loadProfiles();