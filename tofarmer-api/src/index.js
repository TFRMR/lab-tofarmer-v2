import { createClient } from "@supabase/supabase-js";

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const adminSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
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

      // 2. CARI DATA TERKAIT DI KNOWLEDGE_BASE (RAG)
// Kita gunakan fungsi match_knowledge yang sudah kita buat sebelumnya
const { data: ilmu } = await supabase.rpc('match_knowledge', {
  query_embedding: vector,
  match_threshold: 0.3, // Turunkan sedikit agar lebih fleksibel
  match_count: 5        // Ambil 5 potongan pengetahuan agar AI punya banyak konteks
});

// 3. SUSUN KONTEKS
// Mengambil 'content' dari hasil knowledge_base
const context = (ilmu && ilmu.length > 0) 
  ? ilmu.map(i => i.content).join("\n---\n") 
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
        "Dasboard": "Anda adalah asisten petani yang selalu mengarahkan user untuk cek tombol butuh approve dan memberikan voting, menyuruh user untuk sumbang ilmu dengan klik tombol hijau dan menyuruh user memanfaatkan ilmu baku yang sudah ada .",
        "Seni": "Kritikus Kopi: Mengapresiasi karya seni user dengan gaya kritis.",
        "Motivasi": "Si Paling Semangat: Memberikan dorongan moral ala motivator.",
        "Keluarga": "Bapak Rumah Tangga: Fokus pada keseimbangan hidup.",
        "Eksplorasi": "Penjelajah Menoreh: Selalu mengajak user melihat peluang baru.",
        "Evaluasi": "Juri Jujur: Mengevaluasi progres user dengan jujur.",
        "Istirahat": "Kawan Ngopi: Saat user lelah, arahkan untuk rehat sejenak."
      };

      const activeMode = modes[body.trigger] || modes["humor"];

      const aiChat = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
        messages: [
          { 
            // Ganti bagian system content di index.js Anda menjadi ini:
role: "system", 
content: `Anda adalah Mentor ToFarmer dengan mode: ${activeMode}.

--- REFERENSI DATA (Gunakan ini sebagai sumber kebenaran):
${context}
---

${body.trigger === "Gate3-Compile" 
  ? `INSTRUKSI TUGAS: Anda sedang merakit SOP Ilmu Baku. WAJIB Gunakan format berikut:
     - JUDUL: [Nama]
     - KONSEP DASAR: [Penjelasan]
     - PERSIAPAN: [Alat/Bahan]
     - SOP TEKNIS: [Langkah-langkah]
     - PARAMETER KEBERHASILAN: [Indikator]
     - MITIGASI RISIKO: [Mitigasi]
     Gunakan informasi dari REFERENSI DATA di atas untuk mengisi poin-poin tersebut.` 
  : `INSTRUKSI TUGAS: Jawab dengan singkat (maksimal 3 kalimat saja). Fokuslah pada percakapan yang santai dan inspiratif.`}

ATURAN WAJIB:
1. Wajib gunakan Bahasa Indonesia.
2. Jika REFERENSI DATA tersedia, gunakan fakta dari situ. Jika tidak ada, gunakan kebijaksanaan seorang petani senior.
3. JANGAN berikan tutorial teknis yang membosankan kecuali diminta dalam mode Gate3-Compile.`
          },
          { 
            role: "user", 
            content: `Konteks Situasi: ${body.trigger || "Umum"}. Input user: "${textToProcess}".` 
          }
        ],
        // 🌟 DI SINI KUNCI PERBAIKANNYA: Kita buka batas maksimal karakter keluaran hingga 1500 token
        max_tokens: 1500
      });

      return json({ 
        saran: aiChat.response,
        ilmuBaku: aiChat.response 
      }, corsHeaders);
    }
if (url.pathname === "/trigger-sync") {
      const { data: items } = await adminSupabase
        .from('knowledge_base')
        .select('id, content')
        .is('embedding', null)
        .limit(10);

      if (items) {
        for (const item of items) {
          const response = await env.AI.run('@cf/baai/bge-m3', { text: [item.content] });
          await adminSupabase.from('knowledge_base').update({ embedding: response.data[0] }).eq('id', item.id);
        }
      }
      return json({ status: "Sync 10 data berhasil!" }, corsHeaders);
    }

    return json({ status: "ToFarmer API V2 🚀" }, corsHeaders);
  }
};

// =========================
// HELPERS (Hanya satu set saja)
// =========================
function json(data, headers) {
  return new Response(JSON.stringify(data), {
    headers: { ...headers, "Content-Type": "application/json" }
  });
}

function jsonError(error, headers) {
  return new Response(JSON.stringify({ error: true, detail: error }), {
    status: 500,
    headers: { ...headers, "Content-Type": "application/json" }
  });
}

// =========================
// CRON TASK
// =========================
export const scheduled = async (event, env, ctx) => {
  const adminSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: items } = await adminSupabase.from('knowledge_base').select('id, content').is('embedding', null).limit(20);
  
  if (items && items.length > 0) {
    for (const item of items) {
      const response = await env.AI.run('@cf/baai/bge-m3', { text: [item.content] });
      await adminSupabase.from('knowledge_base').update({ embedding: response.data[0] }).eq('id', item.id);
    }
  }
};