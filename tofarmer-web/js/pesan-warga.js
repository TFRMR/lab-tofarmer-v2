// 1. FUNGSI KIRIM PESAN (Panggil fungsi ini saat tombol 'Kirim' ditekan)
// GANTI FUNGSI LAMA INI DENGAN INI:
async function kirimPesanKeSiapaSaja() {
    const target = document.getElementById("targetWalletInput").value.trim();
    const isi = document.getElementById("pesanBaruText").value.trim();
    const myWallet = localStorage.getItem("tof_wallet");

    if (!target || !isi) {
        alert("Harap isi alamat tujuan (Wallet) dan isi pesan!");
        return;
    }

    try {
        const { error } = await supabaseClient
            .from("pesan_warga")
            .insert([{
                pengirim_id: myWallet,
                penerima_id: target,
                isi_pesan: isi,
                is_read: false
            }]);

        if (error) throw error;

        alert("Pesan berhasil dikirim!");
        document.getElementById("pesanBaruText").value = ""; // Bersihkan kolom isi
        // Refresh modal agar pesan yang baru dikirim langsung muncul di daftar
        bukaInbox(); 
    } catch (err) {
        console.error("Gagal mengirim:", err.message);
        alert("Yah, cangkul pesan lagi patah. Coba lagi ya!");
    }
}

// 2. FUNGSI UNTUK MENGAMBIL PESAN MASUK (Untuk badge)
async function updateBadgePesan() {
  if (!currentWallet) return;

  const { count, error } = await supabaseClient
    .from("pesan_warga")
    .select("id", { count: 'exact', head: true })
    .eq("penerima_id", currentWallet)
    .eq("is_read", false);

  const badge = document.getElementById("badge-pesan-tof");
  if (badge && !error) {
    badge.style.display = count > 0 ? "flex" : "none";
    badge.innerText = count > 9 ? "9+" : count;
  }
}

// 3. INISIALISASI OTOMATIS (Satukan saja agar lebih hemat resource)

async function cekPesanMasuk() {
    const myWallet = localStorage.getItem("tof_wallet");

    if (!myWallet) return; 

    // Mencari pesan di mana penerima_id sama dengan wallet user
    const { data, error } = await supabaseClient
        .from('pesan_warga')
        .select('*')
        .eq('penerima_id', myWallet) 
        .eq('is_read', false);

    if (data) {
        const badge = document.getElementById("badge-pesan-tof");
        if (badge) {
            badge.style.display = data.length > 0 ? "flex" : "none";
            badge.innerText = data.length;
        }
    }
}
async function bukaInbox() {
    const myWallet = localStorage.getItem("tof_wallet");
    const modal = document.getElementById("inboxModal");
    const daftarPesan = document.getElementById("daftarPesan");
    
    modal.style.display = "block";
    daftarPesan.innerHTML = "<p style='text-align:center; color: var(--color-text-secondary);'>Memuat percakapan...</p>";

    const { data: pesan } = await supabaseClient
        .from('pesan_warga')
        .select('*')
        .or(`penerima_id.eq.${myWallet},pengirim_id.eq.${myWallet}`)
        .order('created_at', { ascending: true });

    if (!pesan || pesan.length === 0) {
        daftarPesan.innerHTML = "<p style='text-align:center; color: #888;'>Belum ada pesan.</p>";
        return;
    }

    // Ambil semua ID unik (pengirim + penerima) untuk dapat avatar & username
    const semuaId = [...new Set([
        ...pesan.map(p => p.pengirim_id),
        ...pesan.map(p => p.penerima_id)
    ])];

    const { data: profiles } = await supabaseClient
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", semuaId);

    const profileMap = {};
    if (profiles) {
        profiles.forEach(p => { profileMap[p.id] = p; });
    }

    daftarPesan.innerHTML = "";
    pesan.forEach(p => {
        const isMe = p.pengirim_id === myWallet;
        const profil = profileMap[p.pengirim_id];
        const username = profil?.username || "Warga";
        const avatarUrl = profil?.avatar_url;

        const avatarHtml = avatarUrl
            ? `<img src="${avatarUrl}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
            : `<div style="width:32px;height:32px;border-radius:50%;background:#9FE1CB;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:500;color:#085041;flex-shrink:0;">${username[0].toUpperCase()}</div>`;

        const div = document.createElement("div");
        div.style.cssText = `
            display: flex;
            align-items: flex-end;
            gap: 8px;
            margin-bottom: 14px;
            flex-direction: ${isMe ? 'row-reverse' : 'row'};
        `;

        div.innerHTML = `
            ${avatarHtml}
            <div style="display:flex;flex-direction:column;align-items:${isMe ? 'flex-end' : 'flex-start'};">
                ${!isMe ? `<div style="font-size:11px;color:#2f6f4e;font-weight:500;margin-bottom:3px;">@${username}</div>` : ''}
                <div style="
                    display: inline-block;
                    padding: 8px 12px;
                    border-radius: ${isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};
                    background: ${isMe ? '#22c55e' : '#f0f0f0'};
                    color: ${isMe ? 'white' : '#1a1a1a'};
                    font-size: 14px;
                    max-width: 220px;
                    line-height: 1.4;
                ">${p.isi_pesan}</div>
            </div>
        `;
        daftarPesan.appendChild(div);
    });

    daftarPesan.scrollTop = daftarPesan.scrollHeight;
    updateBadgePesan();
}
function closeInbox() {
    document.getElementById("inboxModal").style.display = "none";
}
// Jalankan sistem "Kurir"
setInterval(cekPesanMasuk, 30000);
cekPesanMasuk();