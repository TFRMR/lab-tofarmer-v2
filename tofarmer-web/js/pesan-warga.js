const PESAN_LIMIT = 20;
let pesanOffset = 0;
let semuaPesanHabis = false;

async function updateBadgePesan() {
  const myWallet = localStorage.getItem("tof_wallet");
  if (!myWallet) return;

  const { count, error } = await supabaseClient
    .from("pesan_warga")
    .select("id", { count: 'exact', head: true })
    .eq("penerima_id", myWallet)
    .eq("is_read", false);

  const badge = document.getElementById("badge-pesan-tof");
  if (badge && !error) {
    badge.style.display = count > 0 ? "flex" : "none";
    badge.innerText = count > 9 ? "9+" : count;
  }
}

async function cekPesanMasuk() {
  const myWallet = localStorage.getItem("tof_wallet");
  if (!myWallet) return;

  // Cuma ambil COUNT, bukan select('*')
  const { count } = await supabaseClient
    .from('pesan_warga')
    .select("id", { count: 'exact', head: true })
    .eq('penerima_id', myWallet)
    .eq('is_read', false);

  const badge = document.getElementById("badge-pesan-tof");
  if (badge) {
    badge.style.display = count > 0 ? "flex" : "none";
    badge.innerText = count > 9 ? "9+" : String(count || 0);
  }
}

async function bukaInbox() {
  const myWallet = localStorage.getItem("tof_wallet");
  const modal = document.getElementById("inboxModal");
  const daftarPesan = document.getElementById("daftarPesan");

  // Reset pagination setiap kali inbox dibuka
  pesanOffset = 0;
  semuaPesanHabis = false;

  modal.style.display = "block";
  daftarPesan.innerHTML = "<p style='text-align:center; color:#888;'>Memuat percakapan...</p>";

  await muatPesan(myWallet, true);
  updateBadgePesan();
}

async function muatPesan(myWallet, reset = false) {
  const daftarPesan = document.getElementById("daftarPesan");

  const { data: pesan } = await supabaseClient
    .from('pesan_warga')
    .select('*')
    .or(`penerima_id.eq.${myWallet},pengirim_id.eq.${myWallet}`)
    .order('created_at', { ascending: false }) // terbaru dulu
    .range(pesanOffset, pesanOffset + PESAN_LIMIT - 1);

  if (!pesan || pesan.length === 0) {
    if (reset) daftarPesan.innerHTML = "<p style='text-align:center; color:#888;'>Belum ada pesan.</p>";
    semuaPesanHabis = true;
    document.getElementById("btn-muat-pesan")?.remove();
    return;
  }

  if (pesan.length < PESAN_LIMIT) semuaPesanHabis = true;
  pesanOffset += pesan.length;

  // Ambil username & avatar hanya untuk ID yang ada di batch ini
  const semuaId = [...new Set([...pesan.map(p => p.pengirim_id), ...pesan.map(p => p.penerima_id)])];
  const { data: profiles } = await supabaseClient
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", semuaId);

  const profileMap = {};
  if (profiles) profiles.forEach(p => { profileMap[p.id] = p; });

  // Pesan dibalik agar urutan tampil: lama di atas, baru di bawah
  const pesanUrut = [...pesan].reverse();

  if (reset) daftarPesan.innerHTML = "";

  // Hapus tombol lama kalau ada
  document.getElementById("btn-muat-pesan")?.remove();

  // Tambahkan tombol "Muat lebih" di atas kalau masih ada
  if (!semuaPesanHabis) {
    const btnMuat = document.createElement("div");
    btnMuat.id = "btn-muat-pesan";
    btnMuat.innerHTML = `<p onclick="muatPesan('${myWallet}')" style="text-align:center; color:#2f6f4e; font-size:12px; cursor:pointer; padding:8px;">⬆ Muat pesan sebelumnya</p>`;
    daftarPesan.insertBefore(btnMuat, daftarPesan.firstChild);
  }

  pesanUrut.forEach(p => {
    const isMe = p.pengirim_id === myWallet;
    const profil = profileMap[p.pengirim_id];
    const username = profil?.username || "Warga";
    const avatarUrl = profil?.avatar_url;

    const avatarHtml = avatarUrl
      ? `<img src="${avatarUrl}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
      : `<div style="width:32px;height:32px;border-radius:50%;background:#9FE1CB;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:500;color:#085041;flex-shrink:0;">${username[0].toUpperCase()}</div>`;

    const div = document.createElement("div");
    div.style.cssText = `display:flex;align-items:flex-end;gap:8px;margin-bottom:14px;flex-direction:${isMe ? 'row-reverse' : 'row'};`;
    div.innerHTML = `
      ${avatarHtml}
      <div style="display:flex;flex-direction:column;align-items:${isMe ? 'flex-end' : 'flex-start'};">
        ${!isMe ? `<div style="font-size:11px;color:#2f6f4e;font-weight:500;margin-bottom:3px;">@${username}</div>` : ''}
        <div style="display:inline-block;padding:8px 12px;border-radius:${isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};background:${isMe ? '#22c55e' : '#f0f0f0'};color:${isMe ? 'white' : '#1a1a1a'};font-size:14px;max-width:220px;line-height:1.4;">${p.isi_pesan}</div>
      </div>`;
    daftarPesan.appendChild(div);
  });

  if (reset) daftarPesan.scrollTop = daftarPesan.scrollHeight;
}

async function cariDanKirim() {
  const inputUsername = document.getElementById("targetUsernameInput").value.trim();
  const isiPesan = document.getElementById("pesanBaruText").value.trim();
  const myWallet = localStorage.getItem("tof_wallet");

  if (!inputUsername || !isiPesan) {
    alert("Username dan pesan jangan dikosongkan ya!");
    return;
  }

  const { data: user, error } = await supabaseClient
    .from('profiles')
    .select('id, username')
    .ilike('username', inputUsername)
    .single();

  if (error || !user) {
    alert("Username '" + inputUsername + "' tidak ditemukan di ladang!");
    return;
  }

  const { error: kirimError } = await supabaseClient
    .from("pesan_warga")
    .insert([{ pengirim_id: myWallet, penerima_id: user.id, isi_pesan: isiPesan, is_read: false }]);

  if (kirimError) {
    alert("Gagal mengirim pesan.");
  } else {
    alert("Pesan berhasil dikirim ke @" + user.username);
    document.getElementById("pesanBaruText").value = "";
    document.getElementById("targetUsernameInput").value = "";
    bukaInbox();
  }
}

function closeInbox() {
  document.getElementById("inboxModal").style.display = "none";
}

// Polling hanya jalan kalau inbox TIDAK sedang terbuka — hemat query
setInterval(() => {
  const modalTerbuka = document.getElementById("inboxModal")?.style.display === "block";
  if (!modalTerbuka) cekPesanMasuk();
}, 120000); // diperlambat jadi 120 detik

cekPesanMasuk();