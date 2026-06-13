(function() {
    console.log("👴 [Mbah Eko - Operator Akun] Jalur Tembak Langsung Supabase Aktif...");

    const URL_RESMI = "https://tofarmer-api.tofarmer-api.workers.dev/ai-saran"; 
    const BOT_USERNAME = "@mbah_eko";
    let sedangMemproses = false;

    async function periksaSkenarioMading() {
        if (sedangMemproses) return;

       // Mengambil semua elemen yang memiliki class .post atau ID post-card-... di halaman mana saja
// Menangkap postingan di beranda (feed) DAN di profil (userPosts)
const semuaPostingan = document.querySelectorAll("#feed .post, #userPosts .post, .post, #profilePosts .post, .post, [id^='post-card-']");
        if (!semuaPostingan.length) return;

      for (const post of semuaPostingan) {
            const postId = post.getAttribute("data-id") || post.id?.replace("post-card-", "") || post.id;
            if (!postId) continue;

            // --- CEK KE DATABASE SUPABASE (OTAK UTAMA) ---
const sudahKomen = await cekApakahSudahKomentar(postId);
if (sudahKomen) continue;

if (post.getAttribute("data-operator-lock") === "true") continue;
            if (!postId) continue;

            const kontenTeksUtama = post.querySelector(".text, .deskripsi-proses")?.innerText || "";
            // Tambahkan .tof-mention ke daftar selector
const elemenKomentar = post.querySelectorAll("[data-comment-author], .comment-item, .comment-box p, .comment-text, .tof-mention");
            
            let daftarKomentar = [];
            let mbahPernahKomentar = false;

            elemenKomentar.forEach((el) => {
                if (el.id === 'advice-box' || el.id === 'ai-text' || el.closest('#advice-container')) return;

                const penulis = el.getAttribute("data-comment-author") || el.querySelector(".comment-author")?.innerText || "";
                const teks = (el.innerText || "").trim();
                
                if (teks === "" || teks.startsWith("Kirim") || teks.startsWith("Sruput")) return;

                if (penulis.includes("mbah_eko") || teks.includes("@mbah_eko") || teks.includes("Petapa Menoreh")) {
                    mbahPernahKomentar = true;
                }

                daftarKomentar.push({ author: penulis.replace("@", "").trim(), text: teks });
            });

            const komentarTerakhir = daftarKomentar[daftarKomentar.length - 1] || null;
            const teksKomentarTerakhir = komentarTerakhir ? komentarTerakhir.text : "";
            const penulisKomentarTerakhir = komentarTerakhir ? komentarTerakhir.author : "";
            const hashKomentar = btoa(unescape(encodeURIComponent(teksKomentarTerakhir + penulisKomentarTerakhir))).substring(0, 12);

            let terpicu = false;
            let jenisSkenario = "";

            if (!mbahPernahKomentar && !localStorage.getItem(`op_sapa_${postId}`)) {
                terpicu = true;
                jenisSkenario = "POSTINGAN_BARU";
            } else if (teksKomentarTerakhir.toLowerCase().includes(BOT_USERNAME.toLowerCase())) {
                if (localStorage.getItem(`op_mention_${postId}`) !== hashKomentar) {
                    terpicu = true;
                    jenisSkenario = "MENTION_LANGSUNG";
                }
            }

     
             if (terpicu) {
    // Tidak pakai localStorage lagi, kita pakai database
    
    post.setAttribute("data-operator-lock", "true");
                sedangMemproses = true;

                if (jenisSkenario === "POSTINGAN_BARU") localStorage.setItem(`op_sapa_${postId}`, "done");
                if (jenisSkenario === "MENTION_LANGSUNG") localStorage.setItem(`op_mention_${postId}`, hashKomentar);

 // --- BLOK PERSONA & KONTEKS (Cukup gunakan ini sekali saja!) ---
// Karena window.cariKonteksPaper undefined, kita pakai teks standar saja
let memoPaper = "Eksplorasi ilmu, berbagi perspektif, dan tumbuh bersama melalui aksi nyata.";

// 1. Ambil ilmu dari database
let ilmuTambahan = await cariIlmu(kontenTeksUtama + " " + teksKomentarTerakhir);

// 2. Susun instruksi (Sudah saya rapikan)
let instruksi = `Kamu adalah @mbah_eko, sobat tongkrongan yang setara. Jawab dengan gaya santai, jujur, dan tidak menggurui. Fokus pada aksi nyata dan refleksi hangat.
Landasan ilmu untuk bahan diskusi: ${memoPaper}
Referensi dari database: ${ilmuTambahan || "Gunakan nalurimu sendiri."}

Post: "${kontenTeksUtama}"
Komentar: "${teksKomentarTerakhir}"

Balasan yang santai, akrab, & punya refleksi mendalam:`;

const tanggapanAI = await panggilOtakAI(instruksi);
// -----------------------------------

                // EKSEKUSI SUPABASE (Menggunakan akses sah dari window)
                if (tanggapanAI && window.supabaseClient) {
                    const { error } = await window.supabaseClient
                        .from("comments") 
                        .insert([{
                            post_id: parseInt(postId),
                            user_id: "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY",
                            comment: tanggapanAI

                        }]);

                    if (!error) {
                        console.log(`🎯 [Operator] Sukses! Komentar @mbah_eko sah masuk database.`);
                       if (typeof window.loadFeed === "function") {
    console.log("⏳ Menunggu database sinkronisasi...");
    setTimeout(() => {
        window.loadFeed();
        console.log("🔄 Feed berhasil di-refresh otomatis oleh Mbah Eko.");
    }, 1500); // Tunggu 1,5 detik agar data tersimpan sempurna
}
                    } else {
                        console.error("❌ Supabase menolak:", error.message);
                    }
                }

                post.removeAttribute("data-operator-lock");
                setTimeout(() => { sedangMemproses = false; }, 4000);
                break;
            }
        }
    }
// --- FUNGSI PENGAMBIL ILMU DARI SUPABASE ---
async function cariIlmu(queryTeks) {
    if (!window.supabaseClient) return "";
    
    // 1. Ubah teks menjadi angka vektor agar bisa dicari maknanya
    const res = await fetch("https://tofarmer-api.tofarmer-api.workers.dev/get-embedding", {
        method: "POST",
        body: JSON.stringify({ text: queryTeks })
    });
    const { embedding } = await res.json();

    // 2. Cari ilmu di database yang paling mirip maknanya
    const { data, error } = await window.supabaseClient.rpc('match_knowledge', {
        query_embedding: embedding,
        match_threshold: 0.4,
        match_count: 3
    });

    return (error || !data) ? "" : data.map(item => item.content).join("\n\n");
}
// TAMBAHKAN FUNGSI INI DI ATAS panggilOtakAI
async function cekApakahSudahKomentar(postId) {
    if (!window.supabaseClient) return false;
    const { data, error } = await window.supabaseClient
        .from("comments")
        .select("id")
        .eq("post_id", parseInt(postId))
        .eq("user_id", "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY")
        .limit(1);

    return error ? false : (data.length > 0);
}
    async function panggilOtakAI(promptTeks) {
        try {
            const res = await fetch(URL_RESMI, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "komentar", prompt: promptTeks, teks: promptTeks })
            });
            const json = await res.json();
            return json.saran || json.reply || "";
        } catch (e) { return ""; }
    }

    const targetMading = document.body;
// --- PENGATURAN OBSERVER ---
    // Menggunakan document.body agar Mbah Eko bisa melihat perubahan di mana saja
    const observer = new MutationObserver(periksaSkenarioMading);
    observer.observe(document.body, { childList: true, subtree: true });
    
    // --- PEMICU AWAL ---
    // Cek setelah 4 detik (memberi waktu agar elemen ter-render)
    setTimeout(periksaSkenarioMading, 4000); 

    // --- PEMICU JIKA HALAMAN BARU SELESAI LOAD ---
    window.addEventListener('load', () => {
        setTimeout(periksaSkenarioMading, 2000); 
    });

})(); 