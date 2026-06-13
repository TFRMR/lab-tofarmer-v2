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

// 3. INISIALISASI OTOMATIS
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(updateBadgePesan, 2000);
});
async function cekPesanMasuk() {
    // Pastikan kedua kunci ada sebelum lanjut
    const myWallet = localStorage.getItem("tof_wallet");
    const myUserId = localStorage.getItem("tof_user_id");

    // Jika salah satu saja tidak ada, fungsi berhenti (return)
    if (!myWallet || !myUserId) {
        console.log("Sistem Pesan: User belum login atau data wallet/ID tidak lengkap.");
        return; 
    }

    // Gunakan myUserId sebagai ID penerima untuk query
    const { data, error } = await supabaseClient
        .from('pesan_warga')
        .select('*')
        .eq('penerima_id', myUserId) // Atau gunakan myWallet, tergantung sistem Anda
        .eq('is_read', false);

    if (data) {
        const badge = document.getElementById("badge-pesan-tof");
        if (badge) {
            badge.style.display = data.length > 0 ? "flex" : "none";
            badge.innerText = data.length;
        }
    }
}

// Jalankan sistem "Kurir"
setInterval(cekPesanMasuk, 30000);
cekPesanMasuk();