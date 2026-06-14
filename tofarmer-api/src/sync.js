// sync_chat.js (Buat file worker baru atau sesuaikan)
export default {
  async fetch(request, env) {
    // 1. Ambil data ai_chat_history yang belum punya embedding
    const { data: items } = await env.SUPABASE.from('ai_chat_history')
      .select('id, message') // Ganti content jadi message
      .is('embedding', null)
      .limit(5);

    if (!items || items.length === 0) return new Response("Tidak ada data untuk disinkronkan.");

    for (const item of items) {
      // 2. Gunakan model yang SAMA persis dengan yang dipakai knowledge_base
      const response = await env.AI.run('@cf/baai/bge-m3-en', { text: [item.message] });
      const embedding = response.data[0];

      // 3. Simpan ke tabel ai_chat_history
      await env.SUPABASE.from('ai_chat_history')
        .update({ embedding: embedding })
        .eq('id', item.id);
    }
    return new Response("Sync Chat History Selesai!");
  }
};