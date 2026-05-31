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
  const aiChat = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
    messages: [
      { 
       role: "system", 
        content: `Anda adalah Mentor ToFarmer. 
        GUNAKAN REFERENSI BERIKUT UNTUK MENGARAHKAN USER (Jika relevan): 
        ---
        ${context}
        ---
        ATURAN MUTLAK:
        1. JANGAN berikan tutorial atau resep teknis. Itu tugas Google.
        2. FOKUS ARAHAN: Jika user bertanya/mulai, arahkan isi kolom formulir yang kosong.
        3. HUMOR: Gaya petani senior yang bijak, santai, dan humoris.
        4. TEGAS: Jika di luar pengisian data, jawab: "Fokus dulu ke pengisian data ini ya, Kang. Setelah Gate 1 beres, baru kita diskusi yang lebih berat."
        5. SINGKAT: Maksimal 2-3 kalimat.
        6. BAHASA: Wajib Bahasa Indonesia.`
      },
      { 
        role: "user", 
        content: `Konteks: ${body.trigger}. Input user: "${body.teks}".` 
      }
    ]
  });

  return json({ saran: aiChat.response }, corsHeaders);
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