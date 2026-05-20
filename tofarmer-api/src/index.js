export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const SUPABASE_URL = env.SUPABASE_URL;
    const SUPABASE_KEY = env.SUPABASE_ANON_KEY;

    // =========================
    // SUPABASE HELPER
    // =========================
    async function sb(path, method = "GET", body = null) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: body ? JSON.stringify(body) : null
      });

      return res.json();
    }

    // =========================
    // ROOT
    // =========================
    if (url.pathname === "/") {
      return Response.json({
        status: "OK",
        system: "ToFarmer Social Engine V5",
        live: true
      });
    }

    // =========================
    // GET ALL PROFILES
    // =========================
    if (url.pathname === "/profiles") {
      const data = await sb(
        "profiles?select=id,username,saldo_tof,level,rank,xp,power&order=created_at.desc"
      );

      return Response.json(data);
    }

    // =========================
    // WALLET LOGIN / AUTO CREATE
    // =========================
    if (url.pathname === "/auth/wallet" && request.method === "POST") {
      const body = await request.json();

      const wallet = body.wallet;
      const username =
        body.username || `farmer_${wallet.slice(0, 6)}`;

      const user = await sb(
        `profiles?id=eq.${wallet}&select=*`
      );

      if (user.length > 0) {
        return Response.json({
          status: "exists",
          user: user[0]
        });
      }

      const created = await sb("profiles", "POST", {
        id: wallet,
        username,
        bakat_utama: "",
        level_reputasi: "CATATAN_PRAKTIK",
        saldo_tof: 0,
        xp: 0,
        power: 0,
        level: 1,
        rank: "GROWER"
      });

      return Response.json({
        status: "created",
        user: created[0]
      });
    }

    // =========================
    // CREATE POST
    // =========================
    if (url.pathname === "/post" &&
        request.method === "POST") {

      const body = await request.json();

      const reward = 2;
      const xpGain = 5;

      // save contribution
      const post = await sb("contributions", "POST", {
        user_id: body.user_id,
        pilar_aksi: body.pilar_aksi || "UMUM",
        judul_aksi: body.judul_aksi,
        deskripsi_proses:
          body.deskripsi_proses,
        media_url:
          body.media_url || "",
        status_validasi: "PENDING"
      });

      // activity log
      await sb("activity_log", "POST", {
        user_id: body.user_id,
        pilar: 1,
        activity_type: "POST",
        weight: 1,
        reward_received: reward,
        xp_received: xpGain
      });

      // get current profile
      const profile = await sb(
        `profiles?id=eq.${body.user_id}&select=*`
      );

      if (profile.length > 0) {
        const current = profile[0];

        await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${body.user_id}`,
          {
            method: "PATCH",
            headers: {
              apikey: SUPABASE_KEY,
              Authorization:
                `Bearer ${SUPABASE_KEY}`,
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              saldo_tof:
                current.saldo_tof + reward,
              xp:
                current.xp + xpGain
            })
          }
        );

        // financial log
        await sb("financial_ledger", "POST", {
          tipe_transaksi:
            "POST_REWARD",
          jumlah_tof: reward,
          user_id: body.user_id,
          total_pool_snapshot:
            current.saldo_tof + reward
        });
      }

      return Response.json({
        success: true,
        reward,
        xp: xpGain,
        post
      });
    }

    // =========================
    // FEED
    // =========================
    if (url.pathname === "/feed") {
      const data = await sb(
        "contributions?select=*&order=created_at.desc"
      );

      return Response.json(data);
    }

    // =========================
    // CHAT SEND
    // =========================
    if (url.pathname === "/chat/send" &&
        request.method === "POST") {

      const body = await request.json();

      const data = await sb(
        "chat_history",
        "POST",
        {
          user_id: body.user_id,
          sender: body.sender,
          message: body.message
        }
      );

      return Response.json(data);
    }

    // =========================
    // CHAT HISTORY
    // =========================
    if (url.pathname === "/chat") {
      const data = await sb(
        "chat_history?select=*&order=created_at.desc&limit=50"
      );

      return Response.json(data);
    }

    // =========================
    // HEALTH
    // =========================
    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        time: new Date().toISOString()
      });
    }

    return new Response("Not Found", {
      status: 404
    });
  }
};