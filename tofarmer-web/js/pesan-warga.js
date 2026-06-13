// 1. FUNGSI KIRIM PESAN (Panggil fungsi ini saat tombol 'Kirim' ditekan)
async function kirimPesanPribadi(targetPenerimaId, teks, linkUrl = null, labelTombol = null) {
  if (!currentWallet) {
    alert("Silakan login terlebih dahulu untuk berkirim pesan!");
    return;
  }

  try {
    const { error } = await supabaseClient
      .from("pesan_warga")
      .insert([{
        pengirim_id: currentWallet, // Mengambil ID dari session/wallet yang sedang aktif
        penerima_id: targetPenerimaId,
        isi_pesan: teks,
        link_aksi: linkUrl,
        label_aksi: labelTombol,
        is_read: false
      }]);

    if (error) throw error;
    alert("Pesan berhasil dikirim ke warga!");
  } catch (err) {
    console.error("Gagal mengirim pesan:", err.message);
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
    daftarPesan.innerHTML = "<p>Memuat pesan...</p>";

    const { data } = await supabaseClient
        .from('pesan_warga')
        .select('*')
        .eq('penerima_id', myWallet)
        .order('created_at', { ascending: false });

    if (data && data.length > 0) {
        daftarPesan.innerHTML = "";
        data.forEach(p => {
            const item = document.createElement("div");
            item.className = "pesan-card";
            item.innerHTML = `
                <strong style="color:var(--tw-purple)">Dari: ${p.pengirim_id.substring(0, 10)}...</strong>
                <p style="margin:8px 0 0; font-size:14px; color:#444;">${p.isi_pesan}</p>
            `;
            daftarPesan.appendChild(item);
        });
    } else {
        daftarPesan.innerHTML = "<p style='text-align:center;'>Tidak ada pesan baru.</p>";
    }
}

function closeInbox() {
    document.getElementById("inboxModal").style.display = "none";
}
// Jalankan sistem "Kurir"
setInterval(cekPesanMasuk, 30000);
cekPesanMasuk();