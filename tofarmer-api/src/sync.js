export default {
  async fetch(request, env) {
    // 1. Ambil data dari Webhook Supabase
    const payload = await request.json();
    
    // Webhook Supabase mengirim data di dalam key 'record'
    const record = payload.record;
    
    if (!record || !record.id) {
      return new Response("Data tidak valid", { status: 400 });
    }

    // 2. Generate Embedding
    const response = await env.AI.run('@cf/baai/bge-m3', { 
      text: [record.message] 
    });
    
    const embedding = response.data[0];

    // 3. Update Supabase kembali dengan vektor hasil embedding
    await env.SUPABASE
      .from('ai_chat_history')
      .update({ embedding: embedding })
      .eq('id', record.id);

    return new Response("Embedding sukses!");
  }
};