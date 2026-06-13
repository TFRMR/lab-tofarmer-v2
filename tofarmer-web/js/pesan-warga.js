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
const myUserId = localStorage.getItem("tof_user_id");
    const modal = document.getElementById("inboxModal");
    const daftarPesan = document.getElementById("daftarPesan");
    
    modal.style.display = "block";
    daftarPesan.innerHTML = "<p style='text-align:center;'>Memuat percakapan...</p>";

    // Ambil data pesan
    const { data } = await supabaseClient
        .from('pesan_warga')
        .select('*')
        .or(`penerima_id.eq.${localStorage.getItem("tof_wallet")},pengirim_id.eq.${localStorage.getItem("tof_wallet")}`)
        .order('created_at', { ascending: true }); // ascending agar chat terbaru di bawah

    if (data && data.length > 0) {
        daftarPesan.innerHTML = "";
        data.forEach(p => {
            const isMe = p.pengirim_id === localStorage.getItem("tof_wallet");
            const div = document.createElement("div");
            div.style.cssText = `margin-bottom: 10px; text-align: ${isMe ? 'right' : 'left'};`;
            div.innerHTML = `
                <div style="display:inline-block; padding: 8px 12px; border-radius: 15px; 
                     background: ${isMe ? '#22c55e' : '#e0e0e0'}; color: ${isMe ? 'white' : 'black'}; max-width: 80%;">
                    ${p.isi_pesan}
                </div>
            `;
            daftarPesan.appendChild(div);
        });
        
        // Auto scroll ke pesan paling bawah
        daftarPesan.scrollTop = daftarPesan.scrollHeight;
    } else {
        daftarPesan.innerHTML = "<p style='text-align:center;'>Belum ada pesan.</p>";
    }
}

function closeInbox() {
    document.getElementById("inboxModal").style.display = "none";
}
// Jalankan sistem "Kurir"
setInterval(cekPesanMasuk, 30000);
cekPesanMasuk();