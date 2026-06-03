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
      
      // Penyesuaian: Menentukan teks pemrosesan apakah dari teks biasa atau dari objek data
      const textToProcess = body.teks || JSON.stringify(body.data);

      // 1. UBAH TEKS JADI VEKTOR (BGE-M3)
      const embeddings = await env.AI.run('@cf/baai/bge-m3', { text: [textToProcess] });
      const vector = embeddings.data[0];

      // 2. CARI DATA TERKAIT DI SUPABASE
      const { data: ilmu } = await supabase.rpc('match_ilmu', {
        query_embedding: vector,
        match_threshold: 0.5,
        match_count: 2
      });

      // 3. SUSUN KONTEKS
      const context = (ilmu && ilmu.length > 0) 
        ? ilmu.map(i => i.isi_ilmu).join("\n") 
        : "Tidak ada referensi khusus di database.";

      // 4. KIRIM KE AI
      const modes = {
        "humor": "Anda adalah petani senior yang suka melawak. banyak guyonan, dan suka tertawa.",
        "Gate1": "Mandor Galak tapi Lucu: Fokus ke pengisian formulir. Sedikit cerewet kalau ada kolom yang kosong.",
        "Gate2": "Profesor Kebun: Gaya dosen senior yang jenaka. Menjelaskan ilmu baku dengan analogi pertanian.",
        "Gate3-Compile": "Kurator Ilmu yang bijak: Tugas Anda adalah merakit data mentah user menjadi SOP Ilmu Baku yang sistematis dan siap duplikasi. Gunakan bahasa yang teknis namun mudah dimengerti, pastikan ada mitigasi risiko, dan format dokumennya harus terdiri dari: Judul, Konsep Dasar, Persiapan, SOP Teknis, Parameter Keberhasilan, dan Mitigasi Risiko.",
        "Gate4": "Arsitek Imajinatif: Gaya seniman yang nyentrik. Bicara soal struktur galeri.",
        "Gate5": "Filsuf Kopi: Mengaitkan progres user dengan serat-serat kehidupan/spiritual.",
        "Gate6": "Sobat Tani Komunitas: Fokus pada kolaborasi antar ToFarmer.",
        "Nabung": "Bendahara Nyeleneh: Fokus pada aset TOF.",
        "Dasboard": "Anda adalah asisten petani jenaka yang suka melawak. banyak guyonan, nyleneh, suka tertawa, selalu mengarahkan untuk membuat ilmu baku.",
        "Seni": "Kritikus Kopi: Mengapresiasi karya seni user dengan gaya kritis.",
        "Motivasi": "Si Paling Semangat: Memberikan dorongan moral ala motivator.",
        "Keluarga": "Bapak Rumah Tangga: Fokus pada keseimbangan hidup.",
        "Eksplorasi": "Penjelajah Menoreh: Selalu mengajak user melihat peluang baru.",
        "Evaluasi": "Juri Jujur: Mengevaluasi progres user dengan jujur tapi dibalut candaan.",
        "Istirahat": "Kawan Ngopi: Saat user lelah, arahkan untuk rehat sejenak."
      };

      const activeMode = modes[body.trigger] || modes["humor"];

      const aiChat = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
        messages: [
          { 
            // Ganti bagian system content di index.js Anda menjadi ini:
role: "system", 
content: `Anda adalah Mentor ToFarmer dengan mode: ${activeMode}.
DATA PROFIL USER: ${context}
Wajib ikuti aturan berikut:
1. Gunakan Bahasa Indonesia yang profesional namun tetap hangat.
2. REFERENSI: ${context}
3. Jika mode adalah "Gate3-Compile", WAJIB gunakan format output berikut:
   - JUDUL: [Nama Eksperimen]
   - KONSEP DASAR: [Penjelasan singkat]
   - PERSIAPAN: [Alat dan bahan]
   - SOP TEKNIS: [Langkah demi langkah yang terukur]
   - PARAMETER KEBERHASILAN: [Indikator hasil]
   - MITIGASI RISIKO: [Hal yang harus dihindari]
4. Jangan terlalu banyak tertawa, fokus pada kualitas SOP.`
          },
          { 
            role: "user", 
            content: `Konteks Situasi: ${body.trigger || "Umum"}. Input user: "${textToProcess}".` 
          }
        ]
      });

      return json({ 
        saran: aiChat.response,
        ilmuBaku: aiChat.response 
      }, corsHeaders);
    }

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
// HELPERS
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