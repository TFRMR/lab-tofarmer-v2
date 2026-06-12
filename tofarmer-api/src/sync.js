// Worker ini bertugas "menyapu" baris yang embedding-nya masih NULL
export default {
  async fetch(request, env) {
    // 1. Ambil data yang belum punya embedding
    const { data: items } = await env.SUPABASE.from('knowledge_base')
      .select('id, content')
      .is('embedding', null)
      .limit(5);

    for (const item of items) {
      // 2. Gunakan Cloudflare Workers AI untuk generate embedding
      const response = await env.AI.run('@cf/baai/bge-m3-en', { text: [item.content] });
      const embedding = response.data[0];

      // 3. Simpan kembali ke Supabase
      await env.SUPABASE.from('knowledge_base')
        .update({ embedding: embedding })
        .eq('id', item.id);
    }
    return new Response("Sync Selesai!");
  }
};