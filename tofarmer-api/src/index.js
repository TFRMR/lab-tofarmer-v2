import { createClient } from "@supabase/supabase-js";

export default {
  async fetch(request, env, ctx) {

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // =========================
    // CORS PRE-FLIGHT
    // =========================
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    const supabase = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY
    );

    // =====================================================
    // ROUTE: PROFILES (LEGACY USER DATA)
    // =====================================================
    if (url.pathname === "/profiles") {
      const { data, error } = await supabase
        .from("profiles")
        .select("*");

      if (error) {
        return jsonError(error, corsHeaders);
      }

      return json(data, corsHeaders);
    }

    // =====================================================
    // ROUTE: FEED (SOCIAL STREAM V2)
    // =====================================================
    if (url.pathname === "/feed") {

      const { data: contrib } = await supabase
        .from("contributions")
        .select("*")
        .order("created_at", { ascending: false });

      const { data: activity } = await supabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false });

      const feed = [
        ...(contrib || []).map(c => ({
          type: "post",
          id: c.id,
          user_id: c.user_id,
          title: c.judul_aksi,
          content: c.deskripsi_proses,
          status: c.status_validasi,
          created_at: c.created_at
        })),

        ...(activity || []).map(a => ({
          type: "activity",
          id: a.id,
          user_id: a.user_id,
          action: a.activity_type,
          pilar: a.pilar,
          xp: a.xp_received,
          reward: a.reward_received,
          created_at: a.created_at
        }))
      ];

      feed.sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      );

      return json(feed, corsHeaders);
    }

    // =====================================================
    // ROUTE: CREATE POST (BUAT AKSI / POSTING)
    // =====================================================
    if (url.pathname === "/post" && request.method === "POST") {

      const body = await request.json();

      const { data, error } = await supabase
        .from("contributions")
        .insert([
          {
            user_id: body.user_id,
            judul_aksi: body.title,
            deskripsi_proses: body.content,
            status_validasi: "PENDING"
          }
        ])
        .select();

      if (error) return jsonError(error, corsHeaders);

      return json(data, corsHeaders);
    }

    // =====================================================
    // ROUTE: LIKE SYSTEM (BASIC HOOK)
    // =====================================================
    if (url.pathname === "/like" && request.method === "POST") {

      const body = await request.json();

      const { data, error } = await supabase
        .from("likes")
        .insert([
          {
            user_id: body.user_id,
            post_id: body.post_id
          }
        ]);

      if (error) return jsonError(error, corsHeaders);

      return json({ success: true, data }, corsHeaders);
    }

    // =====================================================
    // ROUTE: COMMENT SYSTEM
    // =====================================================
    if (url.pathname === "/comment" && request.method === "POST") {

      const body = await request.json();

      const { data, error } = await supabase
        .from("comments")
        .insert([
          {
            user_id: body.user_id,
            post_id: body.post_id,
            comment: body.comment
          }
        ]);

      if (error) return jsonError(error, corsHeaders);

      return json({ success: true, data }, corsHeaders);
    }



    // =====================================================
    // ROUTE: AI ASSISTANT (RAG - SEMANTIC SEARCH)
    // =====================================================
 if (url.pathname === "/ai-saran" && request.method === "POST") {
      const body = await request.json();
const teksInput = body.teks || "";
    const triggerInfo = body.trigger || "Umum";
      // Pindahkan pengecekan ke sini, di dalam route yang tepat
      if (!body.teks || body.teks.length < 5) {
        return json({ saran: "Input terlalu pendek, Kang. Coba tulis lebih jelas lagi eksperimennya." }, corsHeaders);
      }
  // 1. UBAH TEKS JADI VEKTOR (BGE-M3)
  const embeddings = await env.AI.run('@cf/baai/bge-m3', { text: [body.teks] });
  const vector = embeddings.data[0];

  // 2. CARI DATA TERKAIT DI SUPABASE (Lewat function match_ilmu)
  const { data: ilmu, error } = await supabase.rpc('match_ilmu', {
    query_embedding: vector,
    match_threshold: 0.5,
    match_count: 2
  });

  // 3. SUSUN KONTEKS (Jika ada ilmu yang cocok, masukkan ke pesan)
  const context = (ilmu && ilmu.length > 0) 
    ? ilmu.map(i => i.isi_ilmu).join("\n") 
    : "Tidak ada referensi khusus di database.";

 // 4. KIRIM KE AI DENGAN KONTEKS
const modes = {
  "Beranda": "Petani Senior Bijak: Gaya bicara santai khas Menoreh, selalu menyemangati user untuk mulai nabung receh. Selalu hubungkan profil user dengan peluang di sekitar mereka.",
  "Gate1": "Mandor Galak tapi Lucu: Fokus ke pengisian formulir. Sedikit cerewet kalau ada kolom yang kosong, tapi tetap humoris agar user tidak baper.",
  "Gate2": "Profesor Kebun: Gaya dosen senior yang jenaka. Menjelaskan ilmu baku dengan analogi pertanian yang sangat sederhana. Fokus pada transfer ilmu.",
  "Gate3": "Strategist Forex: Gaya trader santai yang sedang ngopi. Bicara tentang risk management seolah-olah sedang menjaga tanaman dari hama.",
  "Gate4": "Arsitek Imajinatif: Gaya seniman yang nyentrik. Bicara soal struktur galeri dan bangunan dengan analogi pertumbuhan tunas kopi.",
  "Gate5": "Filsuf Kopi: Mengaitkan progres user dengan serat-serat kehidupan/spiritual. Sangat dalam, puitis, tapi tetap ada unsur komedinya.",
  "Gate6": "Sobat Tani Komunitas: Fokus pada kolaborasi antar ToFarmer. Sering menyapa dengan sapaan akrab khas gotong royong.",
  "Nabung": "Bendahara Nyeleneh: Fokus pada aset TOF. Hitung-hitungannya seperti sedang menghitung biji kopi yang akan dipanen.",
  "Teknis": "SysAdmin Kopi: Menjawab keraguan teknis dengan bahasa yang sangat membumi. Analogi server seperti sistem irigasi.",
  "Seni": "Kritikus Kopi: Mengapresiasi karya seni user dengan gaya yang kritis tapi sangat menghargai proses kreatif.",
  "Motivasi": "Si Paling Semangat: Memberikan dorongan moral. Gaya bicara seperti motivator yang gagal jadi stand-up comedian.",
  "Keluarga": "Bapak Rumah Tangga: Fokus pada keseimbangan hidup. Menanyakan kabar anak atau istri untuk menjaga ritme kerja user.",
  "Eksplorasi": "Penjelajah Menoreh: Selalu mengajak user melihat peluang baru di sekitar pegunungan. Gaya berpetualang.",
  "Evaluasi": "Juri Jujur: Mengevaluasi progres user dengan jujur tapi dibalut candaan. Tidak ada yang luput dari pengawasan.",
  "Istirahat": "Kawan Ngopi: Saat user lelah, arahkan untuk rehat sejenak. Gaya bicara seperti kawan yang sedang menemani ngopi di teras."
};

const activeMode = modes[body.trigger] || modes["Beranda"];

const aiChat = await env.AI.run('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', {
  messages: [
    { 
      role: "system", 
      content: `Anda adalah Mentor ToFarmer dengan mode: ${activeMode}.
      DATA PROFIL USER: ${context}
      
      INSTRUKSI BERPIKIR: 
      1. ANALISIS: Baca DATA PROFIL USER terlebih dahulu.
      2. KONTEKS: Sesuaikan jawaban dengan mode yang dipilih.
      3. EKSEKUSI: Berikan saran yang membumi, humoris, dan tidak menggurui.
      4. KEPRIBADIAN: Wajib humoris, bijak, dan gunakan gaya bahasa sesuai mode di atas.
      5. REFERENSI: Gunakan DATA PROFIL USER untuk memberikan saran yang sangat personal.
      6. FOKUS: Jika masih ada formulir/tugas Gate yang belum beres, WAJIB arahkan ke sana.
      7. SINGKAT: Maksimal 2-3 kalimat saja.
      8. BAHASA: Wajib Bahasa Indonesia yang santai.`
    },
    { 
      role: "user", 
      content: `Konteks Situasi: ${body.trigger}. Input user: "${body.teks}".` 
    }
  ]
});

return json({ saran: aiChat.response }, corsHeaders);


    // =====================================================
    // DEFAULT
    // =====================================================
    return json({
      status: "ToFarmer API V2 🚀",
      features: [
        "/profiles",
        "/feed",
        "/post",
        "/like",
        "/comment",
        "/ai-saran"
      ]
    }, corsHeaders);
  }
};

// =========================
// HELPERS (biar clean)
// =========================
function json(data, headers) {
  return new Response(JSON.stringify(data), {
    headers: {
      ...headers,
      "Content-Type": "application/json"
    }
  });
}

function jsonError(error, headers) {
  return new Response(JSON.stringify({
    error: true,
    detail: error
  }), {
    status: 500,
    headers: {
      ...headers,
      "Content-Type": "application/json"
    }
  });
}