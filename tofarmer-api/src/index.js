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
      
      // 1. Embedding: Ubah teks user jadi vektor pakai model BGE-M3
      const aiEmbedding = await env.AI.run('@cf/baai/bge-m3', { 
        text: [body.teks] 
      });
      const vector = aiEmbedding.data[0];

      // 2. Cari ilmu terkait di Supabase
      const { data: ilmu, error } = await supabase.rpc('match_ilmu', {
        query_embedding: vector,
        match_threshold: 0.5,
        match_count: 3
      });

      if (error) return jsonError(error, corsHeaders);

      // 3. Gabungkan ilmu sebagai konteks untuk LLM
      const context = ilmu && ilmu.length > 0 
        ? ilmu.map(i => i.isi_ilmu).join("\n") 
        : "Tidak ada referensi ilmu yang ditemukan.";

      // 4. Generate jawaban/saran pakai Llama-3
      const aiChat = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          { role: "system", content: "Anda adalah mentor pertanian ToFarmer. Berikan saran singkat berdasarkan referensi ilmu yang diberikan." },
          { role: "user", content: `Pertanyaan: "${body.teks}". Referensi Ilmu: ${context}` }
        ]
      });

      return json({ 
        saran: aiChat.response 
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