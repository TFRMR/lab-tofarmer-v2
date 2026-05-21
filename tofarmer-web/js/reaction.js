async function reactPost(postId, type) {
  if (!currentWallet) {
    alert("Connect wallet dulu 🌿");
    return;
  }

  // =====================
  // 1. AMBIL DATA POSTINGAN
  // =====================
  const { data: post, error: postError } = await supabaseClient
    .from("contributions")
    .select("id, user_id, sruput_count, cangkul_count")
    .eq("id", postId)
    .single();

  if (postError || !post) {
    console.error("🚨 Gagal mengambil data post:", postError);
    alert("Post tidak ditemukan atau gagal dimuat dari database.");
    return;
  }

  // 🚨 CEGAH SELF REWARD
  if (post.user_id === currentWallet) {
    alert("Tidak bisa apresiasi posting sendiri 😄");
    return;
  }

  // =====================
  // 2. CEK APAKAH USER SUDAH PERNAH REACT
  // =====================
  const { data: existing, error: existingError } = await supabaseClient
    .from("reactions")
    .select("*")
    .eq("post_id", postId)
    .eq("user_id", currentWallet)
    .maybeSingle();

  if (existingError) {
    console.error("🚨 Gagal mengecek riwayat reaksi:", existingError);
  }

  let xpReward = type === "sruput" ? 1 : 5;

  // =====================
  // CASE 1: BELUM PERNAH REACT SAMA SEKALI
  // =====================
  if (!existing) {
    // A. Masukkan data reaksi baru
    const { error: insError } = await supabaseClient
      .from("reactions")
      .insert([{
        post_id: postId,
        user_id: currentWallet,
        type: type
      }]);

    if (insError) {
      console.error("🚨 Gagal menyimpan data ke tabel 'reactions':", insError);
      alert("Gagal mengirim reaksi. Pastikan tabel 'reactions' Anda sudah benar.");
      return;
    }

    // B. Hitung counter baru untuk postingan
    let updateFields = {};
    if (type === "sruput") updateFields.sruput_count = (post.sruput_count || 0) + 1;
    if (type === "cangkul") updateFields.cangkul_count = (post.cangkul_count || 0) + 1;

    const { error: countError } = await supabaseClient
      .from("contributions")
      .update(updateFields)
      .eq("id", postId);

    if (countError) {
      console.error("🚨 Gagal memperbarui counter di 'contributions':", countError);
      alert("Gagal memperbarui jumlah hitungan. Apakah kolom sruput_count/cangkul_count sudah ada?");
      return;
    }

    // C. Berikan XP ke pemilik postingan
    const { data: owner, error: ownerError } = await supabaseClient
      .from("profiles")
      .select("xp")
      .eq("id", post.user_id)
      .single();

    if (!ownerError) {
      await supabaseClient
        .from("profiles")
        .update({ xp: (owner?.xp || 0) + xpReward })
        .eq("id", post.user_id);
    }

    await loadFeed();
    alert("Apresiasi terkirim! ✨");
    return;
  }

  // =====================
  // CASE 2: SUDAH PERNAH REACT
  // =====================
  if (existing.type === type) {
    alert("Sudah memberi apresiasi ini 😄");
    return;
  }

  // A. Hitung perubahan counter (Rollback nilai lama & pasang nilai baru)
  let updateData = {};

  if (existing.type === "sruput") {
    updateData.sruput_count = Math.max((post.sruput_count || 1) - 1, 0);
  }
  if (existing.type === "cangkul") {
    updateData.cangkul_count = Math.max((post.cangkul_count || 1) - 1, 0);
  }

  if (type === "sruput") {
    let currentSruput = updateData.sruput_count !== undefined ? updateData.sruput_count : (post.sruput_count || 0);
    updateData.sruput_count = currentSruput + 1;
  }
  if (type === "cangkul") {
    let currentCangkul = updateData.cangkul_count !== undefined ? updateData.cangkul_count : (post.cangkul_count || 0);
    updateData.cangkul_count = currentCangkul + 1;
  }

  // B. Update counter ke tabel contributions
  const { error: updContribError } = await supabaseClient
    .from("contributions")
    .update(updateData)
    .eq("id", postId);

  if (updContribError) {
    console.error("🚨 Gagal mengubah counter di 'contributions':", updContribError);
    alert("Gagal memperbarui hitungan reaksi.");
    return;
  }

  // C. Update jenis reaksi di tabel reactions
  const { error: updReactError } = await supabaseClient
    .from("reactions")
    .update({ type: type })
    .eq("id", existing.id);

  if (updReactError) {
    console.error("🚨 Gagal memperbarui data di 'reactions':", updReactError);
    return;
  }

  // D. Penyesuaian (Adjustment) nilai XP pemilik postingan
  let xpChange = 0;
  if (existing.type === "sruput" && type === "cangkul") xpChange = 4;  // Selisih dari +1 ke +5
  if (existing.type === "cangkul" && type === "sruput") xpChange = -4; // Selisih dari +5 ke +1

  const { data: owner } = await supabaseClient
    .from("profiles")
    .select("xp")
    .eq("id", post.user_id)
    .single();

  const newXP = Math.max((owner?.xp || 0) + xpChange, 0);

  await supabaseClient
    .from("profiles")
    .update({ xp: newXP })
    .eq("id", post.user_id);

  await loadFeed();
  alert("Apresiasi berhasil diubah! 🌿");
}