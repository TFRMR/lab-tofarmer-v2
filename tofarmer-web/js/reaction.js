async function reactPost(postId, type) {
  if (!currentWallet) {
    alert("Connect wallet dulu 🌿");
    return;
  }

  // =====================
  // 1. AMBIL DATA POST
  // =====================
  const { data: post, error: postError } = await supabaseClient
    .from("contributions")
    .select("id, user_id, sruput_count, cangkul_count")
    .eq("id", postId)
    .single();

  if (postError || !post) {
    console.error("🚨 Post error:", postError);
    alert("Post tidak ditemukan.");
    return;
  }

  // 🚨 CEGAH SELF REACTION
  if (post.user_id === currentWallet) {
    alert("Tidak bisa apresiasi posting sendiri 😄");
    return;
  }

  // =====================
  // 2. CEK REACTION USER
  // =====================
  const { data: existing, error: existingError } = await supabaseClient
    .from("reactions")
    .select("*")
    .eq("post_id", postId)
    .eq("user_id", currentWallet)
    .maybeSingle();

  if (existingError) {
    console.error("🚨 Reaction check error:", existingError);
  }

  // =====================
  // 3. CASE: BELUM PERNAH REACT
  // =====================
  if (!existing) {
    const { error: insError } = await supabaseClient
      .from("reactions")
      .insert([{
        post_id: postId,
        user_id: currentWallet,
        type: type
      }]);

    if (insError) {
      console.error("🚨 Insert reaction error:", insError);
      alert("Gagal kirim reaksi.");
      return;
    }

    // update counter post
    const updateFields = {};

    if (type === "sruput") {
      updateFields.sruput_count = (post.sruput_count || 0) + 1;
    }

    if (type === "cangkul") {
      updateFields.cangkul_count = (post.cangkul_count || 0) + 1;
    }

    const { error: updError } = await supabaseClient
      .from("contributions")
      .update(updateFields)
      .eq("id", postId);

    if (updError) {
      console.error("🚨 Counter update error:", updError);
      return;
    }

    await loadFeed();
    alert("Apresiasi terkirim! 🌿");
    return;
  }

  // =====================
  // 4. CASE: SUDAH REACT (TIDAK DIUBAH)
  // =====================
  if (existing.type === type) {
    alert("Sudah memberi apresiasi ini 😄");
    return;
  }

  // =====================
  // 5. CASE: UBAH REACTION
  // =====================
  const { error: updReactError } = await supabaseClient
    .from("reactions")
    .update({ type: type })
    .eq("id", existing.id);

  if (updReactError) {
    console.error("🚨 Update reaction error:", updReactError);
    return;
  }

  // =====================
  // 6. XP DIHITUNG DI DATABASE (TRIGGER)
  // =====================
  // FRONTEND TIDAK HITUNG XP LAGI
  // karena sudah ditangani:
  // sruput = 5 XP
  // cangkul = 15 XP
  // selisih = 10 XP

  await loadFeed();
  alert("Apresiasi berhasil diubah! 🌿");
}