// ============================================================
// tof-komentar — Edge Function KHUSUS komentar (artikel Warta dan video pendek). VERSI SATU FILE (tempel di Dashboard Supabase).
// Nama fungsi: tof-komentar
//
// Aksi (semua balasan HTTP 200 berbentuk { ok: boolean, ... }):
//   komentar_kirim  : pengunjung wajib mengetik nama; pengguna ToFarmer yang masuk (profile_id + token sesi) memakai nama akunnya dan bertanda ✓
//   komentar_hapus  : pemilik komentar, pengurus (ADMIN_IDS), atau pemilik artikel/video boleh menghapus
//   komentar_peran  : siapa yang sedang masuk + apakah boleh menghapus semua komentar di konten itu
//
// Parameter bersama: jenis = "artikel" (bawaan) | "video". Nama kolom isian tetap `artikel_id` agar sama dengan warta-komentar.js (isinya id konten).
// Tabel: artikel_komentar (artikel_id) dan video_komentar (video_id). Dibaca langsung dari browser; ditulis HANYA oleh fungsi ini (service role).
//
// Secrets: ADMIN_IDS (dompet pengurus, dipisah koma), ALLOWED_ORIGINS (opsional). SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY otomatis ada.
// Sesi: token "v1.<exp>.<hmac>" yang dibuat tof-vault saat login (kunci di tabel tertutup tof_secret, salt di pin_secrets). Fungsi ini hanya MEMERIKSA, tidak membuat.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

// ---------------- logic ----------------
export type Row = Record<string, unknown>;
export type Jenis = "artikel" | "video";

export interface Repo {
  findProfileById(id: string): Promise<Row | null>;
  findProfileByUsername(nama: string): Promise<Row | null>; // tidak peka huruf besar/kecil
  getSesiKunci(): Promise<string | null>;
  getPinSalt(id: string): Promise<{ ada: boolean; salt: string | null }>;
  kontenAda(jenis: Jenis, id: string): Promise<{ pemilik: string | null } | null>;
  komentarTerbaru(jenis: Jenis, kontenId: string, penulis: { userId: string | null; nama: string }, limit: number): Promise<{ komentar: string; dibuat: string }[]>;
  komentarSisip(jenis: Jenis, row: Row): Promise<Row | null>;
  komentarCari(jenis: Jenis, id: string): Promise<{ id: string; kontenId: string; userId: string | null } | null>;
  komentarHapus(jenis: Jenis, id: string): Promise<boolean>;
  hitungUlang(jenis: Jenis, kontenId: string): Promise<void>;
}
export interface Deps { repo: Repo; adminIds: string[]; now(): number }

type Res = Record<string, unknown>;
type Gagal = { gagal: Res };
const fail = (error: string, extra: Res = {}): Res => ({ ok: false, error, ...extra });
const ok = (extra: Res = {}): Res => ({ ok: true, ...extra });

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NAMA_DICADANGKAN = ["admin", "administrator", "pengurus", "tofarmer", "to farmer", "moderator", "sistem", "system", "redaksi", "warta tofarmer"];
const JEDA_MS = 8000;               // jarak minimal antar komentar dari penulis yang sama
const DUPLIKAT_MS = 10 * 60000;     // teks yang sama dari penulis yang sama dalam rentang ini ditolak

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function hmacHex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const buf = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Pemeriksaan sesi sama dengan tof-vault (verifikasiSesi): HMAC(kunci, id.exp.salt-PIN)
async function authSesi(body: Row, d: Deps): Promise<{ profile: Row } | Gagal> {
  const id = typeof body.profile_id === "string" ? body.profile_id : "";
  const token = typeof body.token === "string" ? body.token : "";
  if (!id || !token) return { gagal: fail("sesi_tidak_valid") };
  const m = /^v1\.(\d{9,12})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return { gagal: fail("sesi_tidak_valid") };
  const exp = Number(m[1]);
  if (exp * 1000 <= d.now()) return { gagal: fail("sesi_tidak_valid") };
  const profile = await d.repo.findProfileById(id);
  if (!profile) return { gagal: fail("sesi_tidak_valid") };
  const kunci = await d.repo.getSesiKunci();
  const pin = await d.repo.getPinSalt(id);
  if (!kunci || !pin.ada) return { gagal: fail("sesi_tidak_valid") };
  if (!timingSafeEqual(await hmacHex(kunci, `${id}.${exp}.${pin.salt ?? ""}`), m[2])) return { gagal: fail("sesi_tidak_valid") };
  return { profile };
}

const jenisDari = (body: Row): Jenis => (body.jenis === "video" ? "video" : "artikel");

export async function handle(action: unknown, body: Row, d: Deps): Promise<Res> {
  const jenis = jenisDari(body);
  const kontenId = typeof body.artikel_id === "string" ? body.artikel_id : "";

  switch (action) {
    case "komentar_peran": {
      const a = await authSesi(body, d);
      if ("gagal" in a) return a.gagal;
      if (!ID_RE.test(kontenId)) return fail("not_found");
      const konten = await d.repo.kontenAda(jenis, kontenId);
      if (!konten) return fail("not_found");
      const pid = String(a.profile.id);
      const semua = d.adminIds.includes(pid) || konten.pemilik === pid;
      return ok({ id: pid, username: a.profile.username ?? null, semua });
    }

    case "komentar_kirim": {
      if (!ID_RE.test(kontenId)) return fail("not_found");
      if (typeof body.website === "string" && body.website.trim() !== "") return ok({ diabaikan: true }); // jebakan bot (honeypot)
      const isi = typeof body.komentar === "string" ? body.komentar.replace(/\r\n/g, "\n").trim() : "";
      if (!isi || isi.length > 1000) return fail("komentar_tidak_valid");
      const konten = await d.repo.kontenAda(jenis, kontenId);
      if (!konten) return fail("not_found");

      let nama = "", userId: string | null = null, terverifikasi = false;
      if (typeof body.token === "string" && body.token) {
        const a = await authSesi(body, d);
        if ("gagal" in a) return a.gagal;
        nama = String(a.profile.username ?? "");
        userId = String(a.profile.id);
        terverifikasi = true;
      } else {
        nama = typeof body.nama === "string" ? body.nama.replace(/\s+/g, " ").trim() : "";
        if (nama.length < 2 || nama.length > 40 || /[<>]/.test(nama)) return fail("nama_tidak_valid");
        if (NAMA_DICADANGKAN.includes(nama.toLowerCase())) return fail("nama_dicadangkan");
        if (await d.repo.findProfileByUsername(nama)) return fail("nama_milik_pengguna");
      }

      const terbaru = await d.repo.komentarTerbaru(jenis, kontenId, { userId, nama }, 5);
      const sekarang = d.now();
      if (terbaru.some((c) => sekarang - Date.parse(c.dibuat) < JEDA_MS)) return fail("terlalu_cepat");
      if (terbaru.some((c) => c.komentar === isi && sekarang - Date.parse(c.dibuat) < DUPLIKAT_MS)) return fail("duplikat");

      const baris = await d.repo.komentarSisip(jenis, { nama, komentar: isi, terverifikasi, user_id: userId, __konten: kontenId });
      if (!baris) return fail("server_error");
      await d.repo.hitungUlang(jenis, kontenId);
      return ok({ komentar: baris });
    }

    case "komentar_hapus": {
      const a = await authSesi(body, d);
      if ("gagal" in a) return a.gagal;
      const id = typeof body.id === "string" ? body.id : "";
      if (!ID_RE.test(id)) return fail("not_found");
      const k = await d.repo.komentarCari(jenis, id);
      if (!k) return fail("not_found");
      const pid = String(a.profile.id);
      let boleh = k.userId === pid || d.adminIds.includes(pid);
      if (!boleh) boleh = (await d.repo.kontenAda(jenis, k.kontenId))?.pemilik === pid;
      if (!boleh) return fail("bukan_pemilik");
      if (!(await d.repo.komentarHapus(jenis, id))) return fail("server_error");
      await d.repo.hitungUlang(jenis, k.kontenId);
      return ok();
    }

    default:
      return fail("unknown_action");
  }
}

// ---- index ----
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_IDS = (Deno.env.get("ADMIN_IDS") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://www.tofarmer.xyz,https://tofarmer.xyz").split(",").map((s) => s.trim()).filter(Boolean);

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const TABEL: Record<Jenis, { tabel: string; kolom: string; konten: string; pemilik: string; jumlah: string }> = {
  artikel: { tabel: "artikel_komentar", kolom: "artikel_id", konten: "artikel", pemilik: "penulis_id", jumlah: "jumlah_komentar" },
  video: { tabel: "video_komentar", kolom: "video_id", konten: "video_pendek", pemilik: "profile_id", jumlah: "jumlah_komentar" },
};

const repo: Repo = {
  async findProfileById(id) {
    const { data, error } = await db.from("profiles").select("id,username").eq("id", id).maybeSingle();
    if (error) { console.error("findProfileById:", error.message); return null; }
    return (data as Row | null) ?? null;
  },
  async findProfileByUsername(nama) {
    const aman = nama.replace(/[\\%_]/g, "\\$&");
    const { data, error } = await db.from("profiles").select("id").ilike("username", aman).limit(1);
    if (error) { console.error("findProfileByUsername:", error.message); return null; }
    return data && data.length ? (data[0] as Row) : null;
  },
  async getSesiKunci() {
    const { data, error } = await db.from("tof_secret").select("value").eq("name", "sesi_kunci").maybeSingle();
    if (error) { console.error("getSesiKunci:", error.message); return null; }
    return ((data as { value?: string } | null)?.value) ?? null;
  },
  async getPinSalt(id) {
    const { data, error } = await db.from("pin_secrets").select("salt").eq("profile_id", id).maybeSingle();
    if (error) { console.error("getPinSalt:", error.message); return { ada: false, salt: null }; }
    return data ? { ada: true, salt: ((data as { salt?: string | null }).salt) ?? null } : { ada: false, salt: null };
  },
  async kontenAda(jenis, id) {
    const t = TABEL[jenis];
    let q = db.from(t.konten).select("id," + t.pemilik).eq("id", id);
    if (jenis === "artikel") q = q.eq("terbit", true);
    const { data, error } = await q.maybeSingle();
    if (error) { console.error("kontenAda:", error.message); return null; }
    if (!data) return null;
    const p = (data as unknown as Row)[t.pemilik];
    return { pemilik: typeof p === "string" && p !== "" ? p : null };
  },
  async komentarTerbaru(jenis, kontenId, penulis, limit) {
    const t = TABEL[jenis];
    let q = db.from(t.tabel).select("komentar,dibuat").eq(t.kolom, kontenId);
    q = penulis.userId ? q.eq("user_id", penulis.userId) : q.is("user_id", null).eq("nama", penulis.nama);
    const { data, error } = await q.order("dibuat", { ascending: false }).limit(limit);
    if (error) { console.error("komentarTerbaru:", error.message); return []; }
    return (data || []) as { komentar: string; dibuat: string }[];
  },
  async komentarSisip(jenis, row) {
    const t = TABEL[jenis];
    const { __konten, ...isi } = row as Row & { __konten: string };
    const { data, error } = await db.from(t.tabel).insert({ ...isi, [t.kolom]: __konten }).select("id,nama,komentar,terverifikasi,dibuat,user_id").single();
    if (error) { console.error("komentarSisip:", error.message); return null; }
    return data as Row;
  },
  async komentarCari(jenis, id) {
    const t = TABEL[jenis];
    const { data, error } = await db.from(t.tabel).select("id,user_id," + t.kolom).eq("id", id).maybeSingle();
    if (error) { console.error("komentarCari:", error.message); return null; }
    if (!data) return null;
    const r = data as unknown as Row;
    return { id: String(r.id), kontenId: String(r[t.kolom]), userId: typeof r.user_id === "string" ? r.user_id : null };
  },
  async komentarHapus(jenis, id) {
    const t = TABEL[jenis];
    const { data, error } = await db.from(t.tabel).delete().eq("id", id).select("id");
    if (error) { console.error("komentarHapus:", error.message); return false; }
    return !!data && data.length > 0;
  },
  async hitungUlang(jenis, kontenId) {
    // hitung ulang (bukan +1/-1) supaya tetap benar walau ada trigger lain yang juga mengisi kolom jumlah_komentar
    try {
      const t = TABEL[jenis];
      const { count, error } = await db.from(t.tabel).select("id", { count: "exact", head: true }).eq(t.kolom, kontenId);
      if (error) return;
      await db.from(t.konten).update({ [t.jumlah]: count ?? 0 }).eq("id", kontenId);
    } catch (e) { console.error("hitungUlang:", e); }
  },
};

const deps: Deps = { repo, adminIds: ADMIN_IDS, now: () => Date.now() };

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  const json = (obj: unknown) => new Response(JSON.stringify(obj), { headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" });
  try {
    const body = await req.json();
    return json(await handle(body?.action, body ?? {}, deps));
  } catch (e) {
    console.error("tof-komentar error:", e);
    return json({ ok: false, error: "server_error" });
  }
});
