export default {
  async fetch(request, env) {
    const payload = await request.json();
    // Ambil ID dan Message dari request yang dikirim
    const record = payload.record;

    if (!record || !record.id) {
      return new Response("Payload tidak valid", { status: 400 });
    }

    // 1. Generate Embedding
    const aiResponse = await env.AI.run('@cf/baai/bge-m3', { text: [record.message] });
    const embedding = aiResponse.data[0];

    // 2. LANGSUNG UPDATE ID TERSEBUT (Jangan pakai limit/select lain)
    const { data, error } = await env.SUPABASE
      .from('ai_chat_history')
      .update({ embedding: embedding })
      .eq('id', record.id);

    if (error) {
      return new Response("Update Gagal: " + error.message, { status: 500 });
    }

    return new Response("Update Berhasil untuk ID: " + record.id);
  }
};