// ============================================================
// tof-vault — VERSI SATU FILE (untuk tempel di Dashboard Supabase)
// Isinya = lib.ts + logic.ts + index.ts digabung. Nama fungsi: tof-vault
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import algosdk from "npm:algosdk@2.4.0";

// ---------------- lib.ts ----------------
// ============================================================
// lib.ts — fungsi murni (WebCrypto), tanpa dependensi.
// Dipakai oleh logic.ts. Jalan di Deno (Supabase Edge) maupun Node 20+.
// ============================================================

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

export function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomB64(n: number): string {
  return toB64(crypto.getRandomValues(new Uint8Array(n)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{6}$/.test(pin);
}

// Username baru: huruf, angka, underscore (sesuai pola @mention di app.js)
export function isValidUsername(u: unknown): u is string {
  return typeof u === "string" && /^[A-Za-z0-9_]{3,30}$/.test(u);
}

export function normalizeMnemonic(m: unknown): string {
  return typeof m === "string" ? m.trim().toLowerCase().split(/\s+/).join(" ") : "";
}

// Escape karakter wildcard LIKE supaya "_" dan "%" dalam username tidak jadi wildcard
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

// ---------------- PIN ----------------
export const PBKDF2_ITER = 120000;

export interface PinRecord {
  algo: string; // 'pbkdf2' (baru) | 'sha256' (warisan dari kolom profiles.pin_hash lama)
  salt: string | null;
  pin_hash: string;
}

async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

async function pbkdf2Hex(pin: string, saltB64: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin + pepper), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64), iterations: PBKDF2_ITER },
    key,
    256,
  );
  return toHex(bits);
}

export async function makePinRecord(pin: string, pepper: string): Promise<PinRecord> {
  const salt = randomB64(16);
  return { algo: "pbkdf2", salt, pin_hash: await pbkdf2Hex(pin, salt, pepper) };
}

export async function checkPin(pin: string, rec: PinRecord, pepper: string): Promise<boolean> {
  if (rec.algo === "sha256") {
    return timingSafeEqual(await sha256Hex(pin), rec.pin_hash);
  }
  if (!rec.salt) return false;
  return timingSafeEqual(await pbkdf2Hex(pin, rec.salt, pepper), rec.pin_hash);
}

// ---------------- Brankas frasa (AES-256-GCM) ----------------
// Kunci per akun diturunkan (HKDF) dari VAULT_MASTER_KEY + id akun.
// id akun juga dipakai sebagai AAD, jadi ciphertext satu akun tidak bisa dipindah ke akun lain.
async function vaultKey(masterKeyB64: string, profileId: string): Promise<CryptoKey> {
  const master = fromB64(masterKeyB64);
  if (master.length !== 32) throw new Error("VAULT_MASTER_KEY harus 32 byte (base64)");
  const base = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("tof-vault-v1"), info: enc.encode("wallet:" + profileId) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptMnemonic(
  mnemonic: string,
  masterKeyB64: string,
  profileId: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await vaultKey(masterKeyB64, profileId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(profileId) },
    key,
    enc.encode(mnemonic),
  );
  return { ciphertext: toB64(new Uint8Array(ct)), iv: toB64(iv) };
}

export async function decryptMnemonic(
  ciphertextB64: string,
  ivB64: string,
  masterKeyB64: string,
  profileId: string,
): Promise<string> {
  const key = await vaultKey(masterKeyB64, profileId);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64), additionalData: enc.encode(profileId) },
    key,
    fromB64(ciphertextB64),
  );
  return dec.decode(pt);
}

// ---------------- logic.ts ----------------
// ============================================================
// logic.ts — seluruh aturan keamanan (tanpa Supabase/Deno langsung),
// supaya bisa diuji dengan repo palsu di memori.
// ============================================================

export type Row = Record<string, unknown>;
export interface Profile { id: string; username: string; [key: string]: unknown }
export interface PinRow {
  profile_id: string; algo: string; salt: string | null; pin_hash: string;
  fails: number; locked_until: string | null;
}
export interface VaultRow { profile_id: string; ciphertext: string; iv: string; reset_pending: boolean }

export interface Repo {
  findProfilesByUsername(username: string): Promise<Profile[]>; // tidak peka huruf besar/kecil
  findProfileById(id: string): Promise<Profile | null>;
  insertProfile(row: Row): Promise<"ok" | "duplicate" | "error">;
  deleteProfile(id: string): Promise<void>;
  setHasPin(id: string, value: boolean): Promise<void>;
  getPin(id: string): Promise<PinRow | null>;
  upsertPin(row: { profile_id: string; algo: string; salt: string | null; pin_hash: string; fails: number; locked_until: string | null }): Promise<void>;
  setPinFails(id: string, fails: number, lockedUntil: string | null): Promise<void>;
  deletePin(id: string): Promise<void>;
  getVault(id: string): Promise<VaultRow | null>;
  upsertVault(row: { profile_id: string; ciphertext: string; iv: string; reset_pending: boolean }): Promise<void>;
  deleteVault(id: string): Promise<void>;
  clearResetPending(id: string): Promise<void>;
  log(id: string, action: string, ok: boolean): Promise<void>;
}

export interface Deps {
  repo: Repo;
  masterKey: string;
  pepper: string;
  addressFromMnemonic(mnemonic: string): string; // lempar error jika frasa tidak valid
  isValidAddress(address: string): boolean;
  now(): number;
}

export const MAX_FAILS = 5;
export const LOCK_MINUTES = 15;

type Res = Record<string, unknown>;
const fail = (error: string, extra: Res = {}): Res => ({ ok: false, error, ...extra });
const ok = (extra: Res = {}): Res => ({ ok: true, ...extra });

function safeProfile(p: Profile): Profile {
  const copy = { ...p };
  delete copy.pin_hash; // jangan pernah kirim sisa hash lama ke browser
  return copy;
}

function pickProfile(rows: Profile[], username: string): Profile | null | "ambiguous" {
  const exact = rows.find((r) => r.username === username);
  if (exact) return exact;
  if (rows.length === 1) return rows[0];
  if (rows.length > 1) return "ambiguous";
  return null;
}

async function resolveProfile(body: Row, d: Deps, allowId: boolean): Promise<{ profile: Profile } | { error: string }> {
  if (allowId && typeof body.profile_id === "string" && body.profile_id) {
    const p = await d.repo.findProfileById(body.profile_id);
    return p ? { profile: p } : { error: "not_found" };
  }
  const u = body.username;
  if (typeof u !== "string" || !u.trim() || u.length > 100) return { error: "not_found" };
  const rows = await d.repo.findProfilesByUsername(u.trim());
  const pick = pickProfile(rows, u.trim());
  if (pick === "ambiguous") return { error: "ambiguous" };
  return pick ? { profile: pick } : { error: "not_found" };
}

// Verifikasi PIN di server + batas salah PIN (5x → kunci 15 menit)
async function verifyPinFor(profile: Profile, pin: unknown, d: Deps): Promise<Res> {
  if (!isValidPin(pin)) return fail("bad_pin_format");
  const row = await d.repo.getPin(profile.id);
  if (!row) return fail("no_pin");

  const now = d.now();
  if (row.locked_until && Date.parse(row.locked_until) > now) {
    return fail("locked", { retry_min: Math.ceil((Date.parse(row.locked_until) - now) / 60000) });
  }

  if (await checkPin(pin, row, d.pepper)) {
    if (row.fails > 0 || row.locked_until) await d.repo.setPinFails(profile.id, 0, null);
    if (row.algo === "sha256") {
      // PIN warisan (SHA-256 polos) → naikkan ke PBKDF2 + salt + pepper
      const rec = await makePinRecord(pin, d.pepper);
      await d.repo.upsertPin({ profile_id: profile.id, ...rec, fails: 0, locked_until: null });
    }
    return ok();
  }

  const fails = row.fails + 1;
  if (fails >= MAX_FAILS) {
    await d.repo.setPinFails(profile.id, 0, new Date(now + LOCK_MINUTES * 60000).toISOString());
    return fail("locked", { retry_min: LOCK_MINUTES });
  }
  await d.repo.setPinFails(profile.id, fails, null);
  return fail("bad_pin", { left: MAX_FAILS - fails });
}

export async function handle(action: unknown, body: Row, d: Deps): Promise<Res> {
  switch (action) {
    // ---- Cek username: ada/tidak, sudah punya PIN/belum ----
    case "check": {
      const r = await resolveProfile(body, d, false);
      if ("error" in r) {
        return r.error === "not_found" ? ok({ exists: false }) : fail(r.error);
      }
      const hasPin = !!(await d.repo.getPin(r.profile.id));
      return ok({ exists: true, username: r.profile.username, has_pin: hasPin });
    }

    // ---- Login: username + PIN ----
    case "login": {
      const r = await resolveProfile(body, d, false);
      if ("error" in r) return fail(r.error);
      const v = await verifyPinFor(r.profile, body.pin, d);
      if (!v.ok) return v;
      return ok({ profile: safeProfile(r.profile) });
    }

    // ---- Akun lama tanpa PIN: wallet harus cocok, lalu buat PIN ----
    case "set_pin": {
      if (!isValidPin(body.pin)) return fail("bad_pin_format");
      const r = await resolveProfile(body, d, false);
      if ("error" in r) return fail(r.error);
      const p = r.profile;
      if (await d.repo.getPin(p.id)) return fail("already_has_pin");
      const vault = await d.repo.getVault(p.id);
      // Akun yang punya brankas hanya boleh dibuatkan PIN baru kalau admin sudah mereset
      // (alamat wallet itu publik, jadi bukan bukti kepemilikan untuk membuka brankas).
      if (vault && !vault.reset_pending) return fail("reset_required");
      if (typeof body.wallet !== "string" || body.wallet !== p.id) return fail("wallet_mismatch");

      const rec = await makePinRecord(body.pin, d.pepper);
      await d.repo.upsertPin({ profile_id: p.id, ...rec, fails: 0, locked_until: null });
      await d.repo.setHasPin(p.id, true);
      if (vault) await d.repo.clearResetPending(p.id);
      await d.repo.log(p.id, "set_pin", true);
      return ok({ profile: safeProfile(p) });
    }

    // ---- Daftar baru (dompet otomatis dengan frasa, atau dompet sendiri) ----
    case "register": {
      if (!isValidUsername(body.username)) return fail("bad_username");
      if (!isValidPin(body.pin)) return fail("bad_pin_format");
      const username = body.username;

      let address = "";
      let mnemonic = "";
      if (typeof body.mnemonic === "string" && body.mnemonic) {
        mnemonic = normalizeMnemonic(body.mnemonic);
        try {
          address = d.addressFromMnemonic(mnemonic);
        } catch {
          return fail("bad_mnemonic");
        }
      } else if (typeof body.wallet === "string" && d.isValidAddress(body.wallet)) {
        address = body.wallet;
      } else {
        return fail("bad_wallet");
      }

      if ((await d.repo.findProfilesByUsername(username)).length > 0) return fail("username_taken");
      if (await d.repo.findProfileById(address)) return fail("wallet_taken");

      const ins = await d.repo.insertProfile({
        id: address,
        username,
        has_pin: true,
        xp: 0,
        saldo_tof: 0,
        level: 1,
        power: 0,
        avatar_url: "https://www.tofarmer.xyz/aset/favicon.png",
        compost_level: 0,
        fertilizer_count: 0,
        water_stock: 100,
      });
      if (ins === "duplicate") return fail("username_taken");
      if (ins !== "ok") return fail("server_error");

      try {
        const rec = await makePinRecord(body.pin, d.pepper);
        await d.repo.upsertPin({ profile_id: address, ...rec, fails: 0, locked_until: null });
        if (mnemonic) {
          const sealed = await encryptMnemonic(mnemonic, d.masterKey, address);
          await d.repo.upsertVault({ profile_id: address, ...sealed, reset_pending: false });
        }
      } catch (e) {
        console.error("register gagal, rollback:", e);
        await d.repo.deletePin(address).catch(() => {});
        await d.repo.deleteVault(address).catch(() => {});
        await d.repo.deleteProfile(address).catch(() => {});
        return fail("server_error");
      }
      await d.repo.log(address, mnemonic ? "register_vault" : "register", true);
      const created = await d.repo.findProfileById(address);
      return ok({ profile: created ? safeProfile(created) : { id: address, username } });
    }

    // ---- Titip frasa (user lama / yang tadinya pakai dompet sendiri) ----
    case "deposit": {
      const r = await resolveProfile(body, d, true);
      if ("error" in r) return fail(r.error);
      const v = await verifyPinFor(r.profile, body.pin, d);
      if (!v.ok) return v;

      const mnemonic = normalizeMnemonic(body.mnemonic);
      let address = "";
      try {
        address = d.addressFromMnemonic(mnemonic);
      } catch {
        return fail("bad_mnemonic");
      }
      if (address !== r.profile.id) {
        await d.repo.log(r.profile.id, "deposit", false);
        return fail("mnemonic_mismatch");
      }
      const sealed = await encryptMnemonic(mnemonic, d.masterKey, r.profile.id);
      await d.repo.upsertVault({ profile_id: r.profile.id, ...sealed, reset_pending: false });
      await d.repo.log(r.profile.id, "deposit", true);
      return ok();
    }

    // ---- Lihat frasa yang dititip (PIN wajib setiap kali) ----
    case "reveal": {
      const r = await resolveProfile(body, d, true);
      if ("error" in r) return fail(r.error);
      const v = await verifyPinFor(r.profile, body.pin, d);
      if (!v.ok) return v;

      const vault = await d.repo.getVault(r.profile.id);
      if (!vault) return fail("no_vault");
      try {
        const mnemonic = await decryptMnemonic(vault.ciphertext, vault.iv, d.masterKey, r.profile.id);
        await d.repo.log(r.profile.id, "reveal", true);
        return ok({ mnemonic });
      } catch (e) {
        console.error("dekripsi gagal:", e);
        await d.repo.log(r.profile.id, "reveal", false);
        return fail("server_error");
      }
    }

    default:
      return fail("unknown_action");
  }
}

// ---------------- index.ts ----------------
// ============================================================
// Supabase Edge Function: tof-vault
// Actions: check | login | set_pin | register | deposit | reveal
// Semua balasan HTTP 200 dengan JSON { ok: boolean, ... }.
//
// Secrets yang harus di-set (supabase secrets set ...):
//   VAULT_MASTER_KEY  = base64 dari 32 byte acak   (openssl rand -base64 32)
//   PIN_PEPPER        = string acak panjang         (openssl rand -base64 24)
//   ALLOWED_ORIGINS   = (opsional) daftar origin dipisah koma
// SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY sudah otomatis tersedia.
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MASTER_KEY = Deno.env.get("VAULT_MASTER_KEY") ?? "";
const PEPPER = Deno.env.get("PIN_PEPPER") ?? "";
const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://www.tofarmer.xyz,https://tofarmer.xyz")
  .split(",").map((s) => s.trim()).filter(Boolean);

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const repo: Repo = {
  async findProfilesByUsername(username) {
    return must(await db.from("profiles").select("*").ilike("username", escapeLike(username)).limit(10)) as Profile[];
  },
  async findProfileById(id) {
    return must(await db.from("profiles").select("*").eq("id", id).maybeSingle()) as Profile | null;
  },
  async insertProfile(row) {
    const { error } = await db.from("profiles").insert(row);
    if (!error) return "ok";
    console.error("insertProfile:", error.message);
    return error.code === "23505" ? "duplicate" : "error";
  },
  async deleteProfile(id) {
    must(await db.from("profiles").delete().eq("id", id));
  },
  async setHasPin(id, value) {
    must(await db.from("profiles").update({ has_pin: value, pin_hash: null }).eq("id", id));
  },
  async getPin(id) {
    return must(await db.from("pin_secrets").select("*").eq("profile_id", id).maybeSingle()) as PinRow | null;
  },
  async upsertPin(row) {
    must(await db.from("pin_secrets").upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "profile_id" }));
  },
  async setPinFails(id, fails, lockedUntil) {
    must(await db.from("pin_secrets").update({ fails, locked_until: lockedUntil }).eq("profile_id", id));
  },
  async deletePin(id) {
    must(await db.from("pin_secrets").delete().eq("profile_id", id));
  },
  async getVault(id) {
    return must(await db.from("wallet_vault").select("*").eq("profile_id", id).maybeSingle()) as VaultRow | null;
  },
  async upsertVault(row) {
    must(await db.from("wallet_vault").upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "profile_id" }));
  },
  async deleteVault(id) {
    must(await db.from("wallet_vault").delete().eq("profile_id", id));
  },
  async clearResetPending(id) {
    must(await db.from("wallet_vault").update({ reset_pending: false }).eq("profile_id", id));
  },
  async log(id, action, okFlag) {
    await db.from("vault_log").insert({ profile_id: id, action, ok: okFlag }); // best effort
  },
};

const deps: Deps = {
  repo,
  masterKey: MASTER_KEY,
  pepper: PEPPER,
  addressFromMnemonic: (m) => String(algosdk.mnemonicToSecretKey(m).addr),
  isValidAddress: (a) => algosdk.isValidAddress(a),
  now: () => Date.now(),
};

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
  const json = (obj: unknown) =>
    new Response(JSON.stringify(obj), { headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" });

  if (!MASTER_KEY || !PEPPER) {
    console.error("VAULT_MASTER_KEY / PIN_PEPPER belum di-set");
    return json({ ok: false, error: "server_error" });
  }

  try {
    const body = await req.json();
    return json(await handle(body?.action, body ?? {}, deps));
  } catch (e) {
    console.error("tof-vault error:", e);
    return json({ ok: false, error: "server_error" });
  }
});
