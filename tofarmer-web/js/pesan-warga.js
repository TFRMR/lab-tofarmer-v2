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