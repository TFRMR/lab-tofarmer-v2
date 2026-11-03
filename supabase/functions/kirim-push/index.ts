// ============================================================
// kirim-push — mengirim Web Push ke semua perangkat milik satu user.
// Dipanggil HANYA oleh database (pg_net) dengan header x-push-kunci; bukan untuk browser.
//
// Deploy (tanpa cek JWT, karena pemanggilnya database, bukan pengguna):
//   supabase functions deploy kirim-push --no-verify-jwt
// Secrets yang dibutuhkan (Dashboard → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mis. mailto:admin@tofarmer.xyz), PUSH_KUNCI
//   (SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY sudah tersedia otomatis)
// ============================================================
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const J = { "Content-Type": "application/json" };
const balas = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: J });

function samaAman(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Halaman tujuan bila pemanggil tidak menyebut url
function urlDariTipe(tipe: string): string {
  if (tipe.startsWith("pengurus_")) return "/html/admin-topup.html";
  if (tipe.startsWith("dompet_")) return "/html/dompet.html";
  return "/";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return balas({ ok: false, error: "method" }, 405);

  const kunci = Deno.env.get("PUSH_KUNCI") || "";
  const kirimKunci = req.headers.get("x-push-kunci") || "";
  if (!kunci || !samaAman(kunci, kirimKunci)) return balas({ ok: false, error: "tidak_berhak" }, 401);

  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const subjek = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@tofarmer.xyz";
  if (!pub || !priv) return balas({ ok: false, error: "vapid_belum_diatur" }, 500);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return balas({ ok: false, error: "json" }, 400); }

  const userId = typeof b.user_id === "string" ? b.user_id : "";
  const tipe = typeof b.tipe === "string" ? b.tipe.slice(0, 40) : "";
  const isi = typeof b.isi === "string" ? b.isi.slice(0, 180) : "";
  if (!userId || !isi) return balas({ ok: false, error: "data_kurang" }, 400);

  // url harus alamat di situs sendiri (diawali "/" tetapi bukan "//")
  let url = typeof b.url === "string" ? b.url : "";
  if (!url.startsWith("/") || url.startsWith("//")) url = urlDariTipe(tipe);

  // Tag sama = notifikasi lama DITIMPA (tidak menumpuk). Pengurus: satu tag per jenis supaya layar tidak penuh.
  let tag = typeof b.tag === "string" && b.tag ? b.tag.slice(0, 80) : "";
  if (!tag) tag = tipe.startsWith("pengurus_") ? tipe : tipe + ":" + (typeof b.id === "string" ? b.id : Date.now());

  webpush.setVapidDetails(subjek, pub, priv);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: subs, error } = await db.from("push_subscriptions")
    .select("id, endpoint, p256dh, auth").eq("profile_id", userId).limit(10);
  if (error) return balas({ ok: false, error: "db" }, 500);
  if (!subs || subs.length === 0) return balas({ ok: true, terkirim: 0 });

  const muatan = JSON.stringify({ title: "ToFarmer", body: isi, url, tag, icon: "/aset/pwa-192.png", badge: "/aset/pwa-192.png" });
  let terkirim = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        muatan,
        { TTL: 86400, urgency: "high", topic: tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined },
      );
      terkirim++;
      await db.from("push_subscriptions").update({ terakhir_ok: new Date().toISOString() }).eq("id", s.id);
    } catch (e) {
      const kode = (e as { statusCode?: number }).statusCode;
      // 404/410 = perangkat sudah berhenti berlangganan: buang agar tidak dicoba terus
      if (kode === 404 || kode === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
    }
  }));
  return balas({ ok: true, terkirim });
});
