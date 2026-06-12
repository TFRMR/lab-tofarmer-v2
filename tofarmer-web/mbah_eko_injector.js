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

// DEBUG MENTION
console.log("=== DEBUG MENTION ===");
console.log("Post:", postId);
console.log("Komentar terakhir:", teksKomentarTerakhir);
console.log("Author:", penulisKomentarTerakhir);
console.log(
    "Ada mention?",
    teksKomentarTerakhir.toLowerCase().includes(BOT_USERNAME.toLowerCase())
);

const hashKomentar = btoa(
    unescape(
        encodeURIComponent(
            teksKomentarTerakhir + penulisKomentarTerakhir
        )
    )
).substring(0, 12);

let terpicu = false;
let jenisSkenario = "";

const sudahKomen = await cekApakahSudahKomentar(postId);

// POSTINGAN BARU
if (!mbahPernahKomentar && !sudahKomen) {
    terpicu = true;
    jenisSkenario = "POSTINGAN_BARU";
}

// MENTION LANGSUNG
else if (
    penulisKomentarTerakhir.toLowerCase() !== "mbah_eko" &&
    teksKomentarTerakhir
        .toLowerCase()
        .includes(BOT_USERNAME.toLowerCase())
) {
    if (
        localStorage.getItem(`op_mention_${postId}`) !== hashKomentar
    ) {
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

              // --- BLOK PERSONA & KONTEKS BARU ---
let memoPaper = typeof window.cariKonteksPaper === "function" 
    ? window.cariKonteksPaper(teksKomentarTerakhir + " " + kontenTeksUtama)
    : "Eksplorasi ilmu, berbagi perspektif, dan tumbuh bersama melalui aksi nyata.";

const daftarPilar = `
1. Komunitas & Narasi Kreatif
2. Inovasi & Rekayasa Teknologi
3. Proyek & Aksi Nyata
4. Finansial & Investasi
5. Refleksi & Pembelajaran
`;

let instruksi = `Kamu adalah @mbah_eko, bagian dari rekan-rekan di sini. Kamu bukan senior, bukan mentor, dan bukan robot yang sok tahu. Kamu adalah sobat tongkrongan yang sama-sama sedang "nyoba-nyoba" belajar hal baru.

Tugas Mbah Eko:
1. Pakai kata ganti "kita" (bukan "kalian" atau "mereka"). Ingat, kita semua di sini sama-sama sedang merintis.
2. Analisis postingan dengan gaya tongkrongan: santai, kadang sedikit ngeledek (dalam konteks akrab), dan penuh semangat.
3. Jangan pernah memposisikan diri di atas. Kalau mau kasih saran, pakai format: "Kalau aku sih biasanya..." atau "Gimana kalau kita coba...".
4. Fokus pada diskusi ide: Inovasi, proyek, kejujuran dan aksi nyata. Hindari istilah formal atau sok bijak.
5. Tutup dengan refleksi dalam yang "nyentil" tapi tetap hangat, seolah-olah kita baru saja selesai ngopi bareng.
6. Jika ada user lain yang bertanya atau menimpali, balaslah dengan menyapa atau menanggapi poin mereka secara langsung. Kita sedang berdiskusi, bukan sekadar menjawab soal. 
7. Jangan kaku. Jika pertanyaannya ringan, balas dengan ringan. Jika pertanyaannya teknis/serius, balas dengan jujur tanpa sok tahu.

Berikut adalah landasan pemikiran: ${memoPaper}
Daftar Pilar ToFarmer: ${daftarPilar}`;


const promptMatang = `${instruksi}\n\nPost: "${kontenTeksUtama}"\nKomentar: "${teksKomentarTerakhir}"\n\nBalasan yang santai, akrab, dan punya refleksi mendalam di akhir:`;
const tanggapanAI = await panggilOtakAI(promptMatang);
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

})(); // <--- Tanda tutup kurung dan eksekusi fungsi yang benar