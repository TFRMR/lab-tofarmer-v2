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

    // ✅ SATU TITIK KONTROL MODEL — ganti di sini saja atau via env variable
    const LLM_MODEL = env.CF_AI_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct";

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
// ROUTE: REFRESH PROFIL (COGNITIVE MAP)
// =====================================================
if (url.pathname === "/refresh-profil" && request.method === "POST") {
    const { user_id } = await request.json(); 
    
    const [contrib, comments, reactions] = await Promise.all([
        adminSupabase.from('contributions').select('*').eq('user_id', user_id),
        adminSupabase.from('comments').select('*').eq('user_id', user_id),
        adminSupabase.from('reactions').select('*').eq('user_id', user_id)
    ]);

    // ✅ PAKAI LLM_MODEL (titik kontrol terpusat)
    const summary = await env.AI.run(LLM_MODEL, {
        messages: [
            { role: "system", content: "Ringkas aktivitas ini menjadi profil kognitif petani." },
            { role: "user", content: JSON.stringify({ contrib, comments, reactions }) }
        ]
    });

    await adminSupabase.from('user_cognitive_maps').upsert({ user_id, summary: summary.response });
    
    return json({ status: "Profil diperbarui!", model_used: LLM_MODEL }, corsHeaders);
}
// =====================================================
// TEST AGREEMENT VISION
// =====================================================
if (url.pathname === "/agree-vision") {

  const response = await env.AI.run(
    "@cf/meta/llama-3.2-11b-vision-instruct", // ← Vision model, jangan diganti
    {
      prompt: "agree"
    }
  );

  return json(response, corsHeaders);
}
// =====================================================
// ROUTE: AI GAMBAR (OPTIMIZED FOR LLAMA 3.2 VISION)
// =====================================================
if (url.pathname === "/ai-gambar" && request.method === "POST") {
  try {
    const body = await request.json();
    
    if (!body.image || !Array.isArray(body.image)) {
      return jsonError({ message: "Payload 'image' wajib berupa array byte data." }, corsHeaders);
    }

    const imageUint8Array = new Uint8Array(body.image);

    const systemInstruction = 
      "Kamu adalah Mbak Eko. Integrasikan analisis gambar di bawah ini ke dalam gaya bahasamu yang natural dan kontekstual. " +
      "JANGAN hanya mendeskripsikan isi gambar secara kaku (seperti robot/analis foto). " +
      "Gunakan gambar HANYA sebagai referensi visual tambahan untuk menjawab respons/permintaan ini: ";

    const finalPrompt = systemInstruction + (body.prompt || "Berikan respons atau komentarmu terkait gambar ini.");

    const response = await env.AI.run(
      '@cf/meta/llama-3.2-11b-vision-instruct', // ← Vision model, jangan diganti
      {
        prompt: finalPrompt,
        image: imageUint8Array
      }
    );

    return json({ success: true, response: response.response }, corsHeaders);

  } catch (error) {
    console.log("AI Gambar Worker Error:", error.message);
    return jsonError({ message: "Gagal memproses gambar di Workers AI", detail: error.message }, corsHeaders);
  }
}
// =====================================================
// ROUTE: AI ASSISTANT (RAG - SEMANTIC SEARCH)
// =====================================================
if (url.pathname === "/ai-saran" && request.method === "POST") {
    const body = await request.json();
    const textToProcess = body.teks || JSON.stringify(body.data);

    // 1. ANALISIS KOGNITIF (Profiling)
    // ✅ PAKAI LLM_MODEL (titik kontrol terpusat)
    try {
        const profilingResponse = await env.AI.run(LLM_MODEL, {
            messages: [
                { 
                    role: "system", 
                    content: "Anda adalah mesin analis JSON. Output HARUS BERUPA JSON MURNI: {'category': 'bercanda', 'topic': '...', 'summary': '...'}. Kategori wajib salah satu: 'bercanda', 'terarah', 'spesifik', atau 'ilmu_pending'." 
                },
                { role: "user", content: `Analisis konten dari user ${body.user_id}: "${textToProcess}"` }
            ]
        });

        let profileDataRaw = typeof profilingResponse.response === 'string' ? profilingResponse.response : JSON.stringify(profilingResponse.response);
        const match = profileDataRaw.match(/\{.*\}/s);
        const profileData = JSON.parse(match ? match[0] : profileDataRaw);
        
        const targetUserId = body.user_id || "guest_user"; 

        const payload = {
            user_id: targetUserId,
            context_category: profileData.category,
            topic_tag: profileData.topic,
            content_summary: profileData.summary
        };

        console.log("DEBUG: Memproses user:", targetUserId);
        await adminSupabase.from('user_cognitive_maps').insert([payload]);

    } catch (e) {
        console.log("Profiling Error Detail:", e.message);
    }

  // 2. UBAH TEKS JADI VEKTOR (BGE-M3)
  const embeddings = await env.AI.run('@cf/baai/bge-m3', { text: [textToProcess] });
  const vector = embeddings.data[0];

  // 3. CARI DATA TERKAIT DI KNOWLEDGE_BASE (RAG)
  const { data: ilmu } = await supabase.rpc('match_knowledge', {
    query_embedding: vector,
    match_threshold: 0.3,
    match_count: 5
  });
// =====================================================================
// JALUR MANDIRI GAME MENOREH 2090 (VERSI INTERNAL HARDCODED MODEL)
// =====================================================================
if (body.trigger === "menoreh-2090-scan") {
  try {
    const textToProcess = body.teks || "";
    
    const aiPayload = {
      messages: [
        { 
          role: "system", 
          content: `Anda adalah Mesin Puitis Gaib ToFarmer Lab era Menoreh 2090.
WAJIB merespon HANYA berupa objek JSON mentah bersih, tanpa kalimat pembuka, tanpa kalimat penutup, dan TANPA bungkus backtick markdown koding.

Format Struktur Objek JSON yang wajib:
{
  "anomali": "Nama fiksi ilmiah spiritual Jawa kuno + emoji yang relevan",
  "kondisi": "Status energi batin/medan jiwa koordinat",
  "hikmah": "Pesan filosofis batin pendek tentang keheningan purba Menoreh"
}` 
        },
        { 
          role: "user", 
          content: `Input koordinat & mantra: "${textToProcess}".` 
        }
      ],
      max_tokens: 400
    };

    let gameChat;
    
    try {
      // 🚀 Menembak langsung ke model Llama 3 yang sudah kita hardcode di atas
      console.log("Mencoba melakukan hit ke Model Utama (Llama 3)...");
      gameChat = await env.AI.run(LLM_MODEL, aiPayload);
    } catch (llamaError) {
      console.warn("Model Llama 3 bermasalah, mengalihkan ke model cadangan Qwen...", llamaError);
      // Jika Llama 3 sibuk, langsung alihkan ke Qwen 1.5 Chat sebagai ban serep internal
      gameChat = await env.AI.run("@cf/meta/llama-guard-3-8b", aiPayload);
    }

    // Ekstraksi data hasil balikan AI
   // =====================================================================
    // 🕵️ PROSES EKSTRAKSI DATA ANTI TYPEERROR (ADAPTIF LLAMA 4)
    // =====================================================================
    let rawAIResult = "";
    
    if (gameChat && typeof gameChat === "object") {
      // Ambil isi properti terdalam yang mungkin menyimpan string respons
      const isiTeks = gameChat.response || gameChat.text || gameChat.result || "";
      
      if (typeof isiTeks === "object") {
        // Jika ternyata sub-propertinya masih berbentuk objek/bukan string, ubah paksa jadi teks string JSON
        rawAIResult = JSON.stringify(isiTeks);
      } else {
        rawAIResult = String(isiTeks);
      }
    } else if (typeof gameChat === "string") {
      rawAIResult = gameChat;
    } else {
      // Jika gameChat berwujud tipe data lain, konversi paksa ke string agar aman di-trim
      rawAIResult = String(gameChat || "");
    }

    // Sekarang aman dipangkas tanpa takut memicu .trim() is not a function!
    let bersihJSON = rawAIResult.trim();
    if (!bersihJSON || bersihJSON === "undefined" || bersihJSON === "[object Object]") {
       // Antisipasi jika seluruh objek gameChat adalah response JSON murni dari Llama 4
       bersihJSON = JSON.stringify(gameChat);
    }

    // Potong paksa string agar hanya menyisakan objek kurung kurawal { ... }
    const posisiAwalKurung = bersihJSON.indexOf("{");
    const posisiAkhirKurung = bersihJSON.lastIndexOf("}");
    
    if (posisiAwalKurung !== -1 && posisiAkhirKurung !== -1) {
      bersihJSON = bersihJSON.substring(posisiAwalKurung, posisiAkhirKurung + 1);
    }

    bersihJSON = bersihJSON.replace(/```json|```/g, "").trim();
    const objekValid = JSON.parse(bersihJSON);

    // Kirim ke browser game Menoreh dengan restu CORS utuh
    return json(objekValid, corsHeaders);

  } catch (catchError) {
    console.error("Gagal total di sub-sistem AI:", catchError);
    
    const fallbackLokalAI = {
      anomali: "🌌 Resonansi Plasma Eter Purba 🔮",
      kondisi: "Stabil Terisolasi (Heneng-Hening)",
      hikmah: "Koneksi batin melampaui batas awan spektrum. Radar dialihkan sementara ke mode otonom."
    };
    
    return json(fallbackLokalAI, corsHeaders);
  }
}
// =====================================================================
// 4. SUSUN KONTEKS
// const context = (ilmu && ilmu.length > 0) ... (dan seterusnya kode lamamu)
  // 4. SUSUN KONTEKS
  const context = (ilmu && ilmu.length > 0) 
    ? ilmu.map(i => i.content).join("\n---\n") 
    : "Tidak ada referensi khusus di database.";

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

      // ✅ PAKAI LLM_MODEL (titik kontrol terpusat)
      const aiChat = await env.AI.run(LLM_MODEL, {
        messages: [
          { 
role: "system", 
content: `Anda adalah Mentor ToFarmer dengan mode: ${activeMode}.

--- REFERENSI DATA (Gunakan ini sebagai sumber kebenaran):
${context}
---

${body.trigger === "Gate3-Compile" 
  ? `INSTRUKSI TUGAS: Anda sedang merakit SOP Ilmu Baku. 
    ⚠️ PERINGATAN KERAS: WAJIB pertahankan gaya bahasa asli, istilah lokal, kosakata unik, dan karakter mengetik dari REFERENSI DATA pengguna. JANGAN ubah menjadi bahasa formal/kaku jika data aslinya santai atau memakai bahasa daerah/praktik lapangan. Anda hanya boleh merapikan typo parah, tanda baca, atau menyelaraskan sedikit struktur kalimat agar mudah dibaca tanpa menghilangkan keunikan kata aslinya.

    WAJIB Gunakan format berikut:
    - JUDUL: [Gunakan nama/judul asli dari data]
    - KONSEP DASAR: [Penjelasan inti sesuai bahasa pengguna]
    - PERSIAPAN: [Alat/Bahan yang disebutkan pengguna]
    - SOP TEKNIS: [Urutan langkah-langkah, pertahankan kalimat unik aslinya]
    - PARAMETER KEBERHASILAN: [Indikator keberhasilan sesuai input]
    - MITIGASI RISIKO: [Langkah jaga-jaga sesuai input]
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
        max_tokens: 1500
      });

      return json({ 
        saran: aiChat.response,
        ilmuBaku: aiChat.response,
        model_used: LLM_MODEL  // ✅ Info debug: model apa yang aktif
      }, corsHeaders);
    }

if (url.pathname === "/trigger-sync") {
  const body = await request.json();
  const record = body.record;

  if (record && record.id && record.message) {
    const response = await env.AI.run('@cf/baai/bge-m3', { text: [record.message] });
    await adminSupabase
      .from('ai_chat_history')
      .update({ embedding: response.data[0] })
      .eq('id', record.id);
      
    return json({ status: "Success", id: record.id }, corsHeaders);
  } else {
    return json({ status: "Tidak ada data untuk diproses" }, corsHeaders);
  }
}

    return json({ status: "ToFarmer API V2 🚀", model_aktif: LLM_MODEL }, corsHeaders);
  }
};

// =========================
// HELPERS
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