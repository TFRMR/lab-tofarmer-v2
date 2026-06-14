export default {
  async fetch(request, env) {
    try {
      // Cek apakah request memiliki body
      const text = await request.text();
      if (!text) return new Response("Body kosong", { status: 400 });

      let payload;
      try {
        payload = JSON.parse(text);
      } catch (e) {
        return new Response("JSON tidak valid: " + text, { status: 400 });
      }

      // Ambil record dari struktur Webhook Supabase
      const record = payload.record;
      if (!record || !record.id) {
        return new Response("Struktur payload tidak dikenal: " + JSON.stringify(payload), { status: 400 });
      }

      // Generate Embedding
      const response = await env.AI.run('@cf/baai/bge-m3', { 
        text: [record.message] 
      });
      
      const embedding = response.data[0];

      // Update Supabase
      const { error } = await env.SUPABASE
        .from('ai_chat_history')
        .update({ embedding: embedding })
        .eq('id', record.id);

      if (error) return new Response("Gagal update DB: " + error.message, { status: 500 });

      return new Response("Sync Sukses!");
    } catch (err) {
      return new Response("Error tak terduga: " + err.message, { status: 500 });
    }
  }
};