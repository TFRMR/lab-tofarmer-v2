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

export async function sha256Hex(s: string): Promise<string> {
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
  pin_terpisah?: boolean; // true = PIN ini sudah DIPISAH dari hash publik di profiles.pin_hash
}
export interface VaultRow { profile_id: string; ciphertext: string; iv: string; reset_pending: boolean }

export interface Repo {
  findProfilesByUsername(username: string): Promise<Profile[]>; // tidak peka huruf besar/kecil
  findProfileById(id: string): Promise<Profile | null>;
  insertProfile(row: Row): Promise<"ok" | "duplicate" | "error">;
  deleteProfile(id: string): Promise<void>;
  setHasPin(id: string, value: boolean): Promise<void>;
  getPin(id: string): Promise<PinRow | null>;
  upsertPin(row: { profile_id: string; algo: string; salt: string | null; pin_hash: string; fails: number; locked_until: string | null; pin_terpisah?: boolean }): Promise<void>;
  setPinFails(id: string, fails: number, lockedUntil: string | null): Promise<void>;
  deletePin(id: string): Promise<void>;
  getVault(id: string): Promise<VaultRow | null>;
  upsertVault(row: { profile_id: string; ciphertext: string; iv: string; reset_pending: boolean }): Promise<void>;
  deleteVault(id: string): Promise<void>;
  clearResetPending(id: string): Promise<void>;
  log(id: string, action: string, ok: boolean): Promise<void>;
  // ---- Nabung TOF ----
  getSettings(): Promise<Record<string, unknown>>;
  saveSettings(values: Record<string, unknown>, by: string): Promise<void>;
  expireTopups(nowIso: string): Promise<void>;
  insertTopup(row: Record<string, unknown>): Promise<{ result: "ok" | "duplicate" | "error"; row?: TopupRow }>;
  getTopup(id: string): Promise<TopupRow | null>;
  updateTopupIf(id: string, expect: string[], patch: Record<string, unknown>): Promise<TopupRow | null>;
  listTopupByProfile(profileId: string, limit: number): Promise<TopupRow[]>;
  listTopupByStatus(statuses: string[], limit: number): Promise<TopupRow[]>;
  countTopupActive(profileId: string): Promise<number>;
  countTopupSince(profileId: string, sinceIso: string): Promise<number>;
  sumTofAutoSince(sinceIso: string): Promise<number>; // total unit TOF yang dikirim otomatis sejak waktu tsb
  logTopup(requestId: string | null, profileId: string, aksi: string, oleh: string, detail: Record<string, unknown>): Promise<void>;
  // ---- Penampungan & pembagian batch ----
  listDitampung(): Promise<TopupRow[]>;                                   // semua baris berstatus 'ditampung'
  getBatchTerbuka(): Promise<BatchRow | null>;                            // batch 'disiapkan' / 'siap_dibagikan'
  getBatch(id: string): Promise<BatchRow | null>;
  insertBatch(row: Record<string, unknown>): Promise<{ result: "ok" | "duplicate" | "error"; row?: BatchRow }>;
  updateBatchIf(id: string, expect: string[], patch: Record<string, unknown>): Promise<BatchRow | null>;
  assignBatch(ids: string[], batchId: string): Promise<TopupRow[]>;      // hanya baris 'ditampung' yang belum punya batch
  releaseBatch(batchId: string): Promise<void>;                           // lepaskan baris 'ditampung' dari batch
  listTopupByBatch(batchId: string): Promise<TopupRow[]>;
  // ---- Tarik dana ----
  insertTarik(row: Record<string, unknown>): Promise<{ result: "ok" | "error"; row?: TarikRow }>;
  getTarik(id: string): Promise<TarikRow | null>;
  updateTarikIf(id: string, expect: string[], patch: Record<string, unknown>): Promise<TarikRow | null>;
  listTarikByProfile(profileId: string, limit: number): Promise<TarikRow[]>;
  listTarikByStatus(statuses: string[], limit: number): Promise<TarikRow[]>;
  countTarikActive(profileId: string): Promise<number>;
  countTarikSince(profileId: string, sinceIso: string): Promise<number>;
  expireTarik(nowIso: string): Promise<void>;
  txidTarikSudahAda(txid: string, exceptId: string): Promise<boolean>;
}

export interface TarikRow {
  id: string; profile_id: string; jumlah_tof_units: number; kurs_rp_per_tof: number; jumlah_rp: number;
  tujuan_jenis: string; tujuan_nomor: string; tujuan_nama: string; alamat_tarik: string; status: string;
  tof_txid: string | null; catatan_sistem: string | null; catatan_admin: string | null; ref_bayar: string | null;
  dibuat: string; kedaluwarsa_pada: string; tof_diterima_pada: string | null; dibayar_oleh: string | null; dibayar_pada: string | null;
}

export interface BatchRow {
  id: string; nomor: number; status: string; total_tof_units: number; jumlah_item: number;
  dibuat: string; dibuat_oleh: string | null; investasi_oleh: string | null; investasi_pada: string | null;
  investasi_catatan: string | null; selesai_pada: string | null;
}

export interface TopupRow {
  id: string; profile_id: string; nominal_rp: number; kode_unik: number; total_rp: number;
  kurs_rp_per_tof: number; tof_units: number; status: string; ref_user: string | null; catatan_admin: string | null;
  dibuat: string; kedaluwarsa_pada: string; dikonfirmasi_oleh: string | null; dikonfirmasi_pada: string | null;
  tof_txid: string | null; selesai_pada: string | null; selesai_oleh: string | null;
  auto_kirim_pada?: string | null; kirim_catatan?: string | null;
  jalur?: string | null; ditampung_pada?: string | null; batch_id?: string | null;
  txid_distribusi?: string | null; distribusi_pada?: string | null;
}

// Jembatan ke jaringan Algorand untuk pengiriman TOF otomatis dari dompet pembayar khusus
export interface Chain {
  payoutAddress(): string | null;
  getAccount(addr: string): Promise<{ algo: bigint; minBal: bigint; tof: bigint; tofOptin: boolean }>;
  // Membuat, menandatangani, dan mengirim transaksi TOF. Melempar { kind: "ditolak" | "ambigu", message }:
  //   ditolak = pasti tidak terkirim; ambigu = hasil tidak pasti (mis. jaringan putus setelah kirim).
  sendTof(a: { to: string; amount: bigint; note: string; leaseKey: string }): Promise<{ txId: string }>;
  status(txId: string): Promise<"confirmed" | "pending" | "rejected" | "unknown">;
  // Rincian transfer TOF yang sudah terkonfirmasi (dipakai memverifikasi TOF yang dikirim anggota untuk penarikan)
  getTransfer(txId: string): Promise<{ status: "confirmed" | "pending" | "not_found"; sender?: string; receiver?: string; isTof?: boolean; amount?: bigint }>;
}

export interface Deps {
  repo: Repo;
  masterKey: string;
  pepper: string;
  addressFromMnemonic(mnemonic: string): string; // lempar error jika frasa tidak valid
  isValidAddress(address: string): boolean;
  now(): number;
  adminIds?: string[]; // alamat dompet pengurus (secret ADMIN_IDS)
  chain?: Chain;       // pengiriman TOF otomatis (opsional)
  sleep?: (ms: number) => Promise<void>;
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

// Akun lama yang hash PIN-nya masih ada di kolom profiles.pin_hash (bisa dibaca publik, dan PIN 6 digit
// mudah ditebak dari hash itu). Untuk akun seperti ini brankas frasa belum boleh dipakai.
function hasPublicPinHash(p: Profile): boolean {
  return typeof p.pin_hash === "string" && p.pin_hash !== "";
}

// Brankas hanya aman kalau PIN-nya TIDAK bisa ditebak dari hash publik. Akun lama baru dianggap aman
// setelah PIN dompetnya dipisah (ganti_pin) dari PIN lama yang hash-nya masih ada di profiles.pin_hash.
function pinPublikAktif(p: Profile, pinRow: PinRow | null): boolean {
  return hasPublicPinHash(p) && !(pinRow && pinRow.pin_terpisah === true);
}

// Pengaman tambahan saat dipakai: PIN yang diketik sama persis dengan hash publik
// (mis. pengguna membuat PIN yang sama di halaman Jurnal/Scan/Tracker setelah dipisah).
async function samaDenganHashPublik(p: Profile, pin: unknown): Promise<boolean> {
  return hasPublicPinHash(p) && typeof pin === "string" && (await sha256Hex(pin)) === p.pin_hash;
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
      await d.repo.upsertPin({ profile_id: profile.id, ...rec, fails: 0, locked_until: null, ...(row.pin_terpisah ? { pin_terpisah: true } : {}) });
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
      if (pinPublikAktif(r.profile, await d.repo.getPin(r.profile.id))) return fail("pin_publik");
      const v = await verifyPinFor(r.profile, body.pin, d);
      if (!v.ok) return v;
      if (await samaDenganHashPublik(r.profile, body.pin)) return fail("pin_publik");

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
      if (pinPublikAktif(r.profile, await d.repo.getPin(r.profile.id))) return fail("pin_publik");
      const v = await verifyPinFor(r.profile, body.pin, d);
      if (!v.ok) return v;
      if (await samaDenganHashPublik(r.profile, body.pin)) return fail("pin_publik");

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

    // ---- Ganti PIN (dan memisahkannya dari hash publik untuk akun lama) ----
    // PIN lama dipakai membuktikan pemilik akun; PIN baru WAJIB berbeda dari PIN lama dan dari hash publik.
    case "ganti_pin": {
      if (!isValidPin(body.pin_baru)) return fail("bad_pin_format");
      const r = await resolveProfile(body, d, true);
      if ("error" in r) return fail(r.error);
      const v = await verifyPinFor(r.profile, body.pin, d);
      if (!v.ok) return v;
      if (body.pin_baru === body.pin) return fail("pin_sama");
      if (await samaDenganHashPublik(r.profile, body.pin_baru)) return fail("pin_baru_sama_publik");

      const rec = await makePinRecord(body.pin_baru, d.pepper);
      await d.repo.upsertPin({ profile_id: r.profile.id, ...rec, fails: 0, locked_until: null, pin_terpisah: true });
      await d.repo.log(r.profile.id, "ganti_pin", true);
      return ok();
    }

    // ---- Status brankas (tanpa PIN): dipakai halaman Dompet untuk menampilkan tombol yang sesuai ----
    case "vault_status": {
      const r = await resolveProfile(body, d, true);
      if ("error" in r) return fail(r.error);
      const vault = await d.repo.getVault(r.profile.id);
      const pin = await d.repo.getPin(r.profile.id);
      return ok({ has_vault: !!vault, has_pin: !!pin, pin_publik: pinPublikAktif(r.profile, pin) });
    }

    default:
      return await handleTopup(action, body, d);
  }
}

// ============================================================
// NABUNG TOF — top-up rupiah (QRIS) dikonfirmasi manual oleh pengurus
// ============================================================
const TOPUP_TTL_MS = 24 * 3600 * 1000;
const TOPUP_MAKS_PER_HARI = 5;
const TXID_RE = /^[A-Z2-7]{52}$/;
const QRIS_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

const iso = (ms: number) => new Date(ms).toISOString();
const teks = (v: unknown, maks: number): string => (typeof v === "string" ? v.trim().slice(0, maks) : "");

async function ambilPengaturan(d: Deps) {
  const s = await d.repo.getSettings();
  const angka = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : def);
  return {
    kurs: angka(s.kurs_rp_per_tof, 1000), // 1 TOF = Rp 1.000 (keputusan komunitas)
    min_rp: angka(s.min_rp, 5000),
    maks_rp: angka(s.maks_rp, 1000000),
    aktif: s.aktif !== false,
    nama_penerima: teks(s.nama_penerima, 80),
    aturan: teks(s.aturan, 1500),
    qris: typeof s.qris === "string" && QRIS_RE.test(s.qris) ? s.qris : null,
    auto_kirim: s.auto_kirim === true,
    batas_harian_tof: angka(s.batas_harian_tof, 100),     // dalam TOF
    batas_transaksi_tof: angka(s.batas_transaksi_tof, 50), // dalam TOF
    // 'tampung' (bawaan): TOF dikirim ke dompet penampung dulu, dibagikan per batch. 'langsung': ke dompet anggota.
    mode_kirim: s.mode_kirim === "langsung" ? "langsung" : "tampung",
    alamat_penampung: typeof s.alamat_penampung === "string" && d.isValidAddress(s.alamat_penampung) ? s.alamat_penampung : "",
    ambang_batch_tof: angka(s.ambang_batch_tof, 500),     // minimal TOF terkumpul sebelum dibagikan
    tarik_aktif: s.tarik_aktif === true,
    alamat_tarik: typeof s.alamat_tarik === "string" && d.isValidAddress(s.alamat_tarik) ? s.alamat_tarik : "", // dompet pengurus penerima TOF penarikan
    min_tarik_tof: angka(s.min_tarik_tof, 5),
    maks_tarik_tof: angka(s.maks_tarik_tof, 500),
  };
}

function tampilAdmin(r: TopupRow) {
  return { ...tampilTopup(r), kirim_catatan: r.kirim_catatan ?? null, auto_kirim_pada: r.auto_kirim_pada ?? null };
}

function tampilTopup(r: TopupRow) {
  return {
    id: r.id, nominal_rp: r.nominal_rp, kode_unik: r.kode_unik, total_rp: r.total_rp, tof_units: r.tof_units,
    status: r.status, ref_user: r.ref_user, catatan_admin: r.catatan_admin, dibuat: r.dibuat,
    kedaluwarsa_pada: r.kedaluwarsa_pada, tof_txid: r.tof_txid, txid_distribusi: r.txid_distribusi ?? null,
  };
}

// Catatan (note) yang menempel pada tiap transaksi TOF hasil nabung, mis.:
//   CYBER_FARMER # J36JCUNG3IVLVWQ6VZO56T5E2RF3THZAH6235O2YIJZ75UAI57JUAGPYSQ # nabung receh
export function catatanNabung(username: string, address: string): string {
  return (username || "-") + " # " + address + " # nabung receh";
}

type Gagal = { gagal: Res };

async function authUser(body: Row, d: Deps): Promise<{ profile: Profile } | Gagal> {
  const r = await resolveProfile(body, d, true);
  if ("error" in r) return { gagal: fail(r.error) };
  const v = await verifyPinFor(r.profile, body.pin, d);
  if (!v.ok) return { gagal: v };
  return { profile: r.profile };
}

// Pengurus: alamat harus ada di ADMIN_IDS, PIN benar, dan PIN-nya tidak boleh bocor lewat hash publik
async function authAdmin(body: Row, d: Deps): Promise<{ profile: Profile } | Gagal> {
  const ids = d.adminIds || [];
  if (ids.length === 0) return { gagal: fail("admin_belum_diatur") };
  const r = await resolveProfile(body, d, true);
  if ("error" in r) return { gagal: fail(r.error) };
  if (!ids.includes(r.profile.id)) return { gagal: fail("bukan_admin") };
  if (pinPublikAktif(r.profile, await d.repo.getPin(r.profile.id))) return { gagal: fail("pin_publik") };
  const v = await verifyPinFor(r.profile, body.pin, d);
  if (!v.ok) return { gagal: v };
  if (await samaDenganHashPublik(r.profile, body.pin)) return { gagal: fail("pin_publik") };
  return { profile: r.profile };
}

function acakKode(): number[] {
  const k = Array.from({ length: 99 }, (_, i) => i + 1);
  const rnd = crypto.getRandomValues(new Uint32Array(k.length));
  for (let i = k.length - 1; i > 0; i--) {
    const j = rnd[i] % (i + 1);
    [k[i], k[j]] = [k[j], k[i]];
  }
  return k;
}

// ---------------- pengiriman TOF otomatis ----------------
// Dijalankan setelah pengurus mengonfirmasi pembayaran. Pengamannya berlapis:
//  1) hanya jika diaktifkan pengurus, dengan batas per transaksi dan batas harian,
//  2) klaim atomik (status 'mengirim') supaya satu tagihan tidak pernah dikirim dua kali,
//  3) 'lease' Algorand dari ID tagihan: jaringan menolak transaksi ganda dengan lease sama,
//  4) pemeriksaan penerima (opt-in) dan saldo dompet pembayar sebelum mengirim.
type Payout = { status: "selesai" | "ditampung" | "mengirim" | "tertunda"; alasan?: string; txid?: string };
const FEE_UNITS = 1000n;
const tidur = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

async function kembalikanKeDikonfirmasi(d: Deps, id: string, alasan: string) {
  await d.repo.updateTopupIf(id, ["mengirim"], { status: "dikonfirmasi", kirim_catatan: alasan, tof_txid: null, auto_kirim_pada: null });
}

async function tungguKonfirmasi(txId: string, d: Deps): Promise<"confirmed" | "pending" | "rejected"> {
  for (let i = 0; i < 8; i++) {
    const st = await d.chain!.status(txId);
    if (st === "confirmed" || st === "rejected") return st;
    await (d.sleep ?? tidur)(2500);
  }
  return "pending";
}

// Status setelah TOF terbukti sampai: 'ditampung' (jalur tampung) atau 'selesai' (jalur langsung)
function patchSetelahTerkirim(jalur: string | null | undefined, oleh: string, d: Deps): Record<string, unknown> {
  return jalur === "tampung"
    ? { status: "ditampung", ditampung_pada: iso(d.now()) }
    : { status: "selesai", selesai_pada: iso(d.now()), selesai_oleh: "otomatis:" + oleh };
}

async function jalankanPayout(row: TopupRow, oleh: string, d: Deps): Promise<Payout> {
  const chain = d.chain;
  const s = await ambilPengaturan(d);
  const tunda = async (alasan: string): Promise<Payout> => {
    await d.repo.updateTopupIf(row.id, ["dikonfirmasi"], { kirim_catatan: alasan });
    return { status: "tertunda", alasan };
  };
  if (!s.auto_kirim) return { status: "tertunda", alasan: "Kirim otomatis nonaktif." };
  if (!chain || !chain.payoutAddress()) return tunda("Dompet pembayar belum diatur (secret PAYOUT_MNEMONIC).");
  const jalur = s.mode_kirim;
  const tujuanAlamat = jalur === "tampung" ? s.alamat_penampung : row.profile_id;
  if (!tujuanAlamat) return tunda("Alamat dompet penampung belum diatur (Pengaturan → Kirim TOF otomatis).");

  const units = BigInt(row.tof_units);
  if (units > BigInt(s.batas_transaksi_tof) * 1000000n) return tunda("Melebihi batas per transaksi kirim otomatis. Kirim manual.");
  const terpakai = BigInt(await d.repo.sumTofAutoSince(iso(d.now() - 24 * 3600 * 1000)));
  if (terpakai + units > BigInt(s.batas_harian_tof) * 1000000n) return tunda("Melebihi batas harian kirim otomatis. Kirim manual atau tunggu.");

  const klaim = await d.repo.updateTopupIf(row.id, ["dikonfirmasi"], { status: "mengirim", auto_kirim_pada: iso(d.now()), kirim_catatan: null, jalur });
  if (!klaim) return { status: "tertunda", alasan: "Status tagihan sudah berubah." };

  try {
    const [kas, tujuan] = await Promise.all([chain.getAccount(chain.payoutAddress()!), chain.getAccount(tujuanAlamat)]);
    const gagal = !tujuan.tofOptin ? (jalur === "tampung" ? "Dompet penampung belum opt-in TOF. Opt-in dulu, lalu kirim ulang." : "Penerima belum opt-in TOF. Minta anggota opt-in, lalu kirim ulang.")
      : kas.tof < units ? "Saldo TOF dompet pembayar kurang. Isi ulang dompet pembayar."
      : kas.algo - kas.minBal < FEE_UNITS ? "Saldo ALGO dompet pembayar kurang untuk biaya. Isi ulang dompet pembayar."
      : "";
    if (gagal) { await kembalikanKeDikonfirmasi(d, row.id, gagal); return { status: "tertunda", alasan: gagal }; }
  } catch (e) {
    console.error("pra-cek payout:", e);
    await kembalikanKeDikonfirmasi(d, row.id, "Gagal membaca jaringan Algorand. Coba kirim ulang.");
    return { status: "tertunda", alasan: "Gagal membaca jaringan Algorand. Coba kirim ulang." };
  }

  let txId = "";
  const profilPenerima = await d.repo.findProfileById(row.profile_id);
  const catatan = catatanNabung(profilPenerima?.username || "", row.profile_id);
  try {
    ({ txId } = await chain.sendTof({ to: tujuanAlamat, amount: units, note: catatan, leaseKey: row.id }));
  } catch (e) {
    const kind = (e as { kind?: string })?.kind;
    const pesan = String((e as { message?: string })?.message || "").slice(0, 150);
    await d.repo.logTopup(row.id, row.profile_id, "kirim_gagal", oleh, { kind, pesan });
    if (kind === "ditolak") {
      await kembalikanKeDikonfirmasi(d, row.id, "Ditolak jaringan: " + pesan);
      return { status: "tertunda", alasan: "Ditolak jaringan: " + pesan };
    }
    const cat = "Hasil pengiriman tidak pasti. Periksa dompet pembayar di explorer sebelum mengirim ulang.";
    await d.repo.updateTopupIf(row.id, ["mengirim"], { kirim_catatan: cat });
    return { status: "mengirim", alasan: cat };
  }

  await d.repo.updateTopupIf(row.id, ["mengirim"], { tof_txid: txId });
  await d.repo.logTopup(row.id, row.profile_id, "kirim_otomatis", oleh, { txid: txId, tof_units: row.tof_units });
  const hasil = await tungguKonfirmasi(txId, d);
  if (hasil === "confirmed") {
    await d.repo.updateTopupIf(row.id, ["mengirim"], patchSetelahTerkirim(jalur, oleh, d));
    await d.repo.logTopup(row.id, row.profile_id, jalur === "tampung" ? "ditampung_otomatis" : "selesai_otomatis", oleh, { txid: txId });
    return { status: jalur === "tampung" ? "ditampung" : "selesai", txid: txId };
  }
  if (hasil === "rejected") {
    await kembalikanKeDikonfirmasi(d, row.id, "Transaksi ditolak jaringan setelah dikirim. Coba kirim ulang.");
    return { status: "tertunda", alasan: "Transaksi ditolak jaringan setelah dikirim." };
  }
  return { status: "mengirim", txid: txId, alasan: "Menunggu konfirmasi jaringan. Tekan Periksa status beberapa saat lagi." };
}

async function handleTopup(action: unknown, body: Row, d: Deps): Promise<Res> {
  switch (action) {
    // ---- publik: info untuk menampilkan tombol & tagihan ----
    case "topup_info": {
      const s = await ambilPengaturan(d);
      const pool = (await d.repo.listDitampung()).reduce((n, r) => n + Number(r.tof_units), 0);
      return ok({
        aktif: s.aktif && !!s.qris, kurs: s.kurs, min_rp: s.min_rp, maks_rp: s.maks_rp,
        nama_penerima: s.nama_penerima, aturan: s.aturan, qris: s.qris,
        mode_kirim: s.mode_kirim, ambang_batch_tof: s.ambang_batch_tof, pool_tof_units: pool,
        tarik_aktif: s.tarik_aktif && !!s.alamat_tarik, alamat_tarik: s.alamat_tarik, min_tarik_tof: s.min_tarik_tof, maks_tarik_tof: s.maks_tarik_tof,
      });
    }

    // ---- anggota: buat tagihan ----
    case "topup_buat": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      const s = await ambilPengaturan(d);
      if (!(s.aktif && s.qris)) return fail("topup_nonaktif");
      const nominal = Number(body.nominal_rp);
      if (!Number.isInteger(nominal) || nominal < s.min_rp || nominal > s.maks_rp) {
        return fail("nominal_tidak_valid", { min_rp: s.min_rp, maks_rp: s.maks_rp });
      }
      const sekarang = d.now();
      await d.repo.expireTopups(iso(sekarang));
      if ((await d.repo.countTopupActive(a.profile.id)) > 0) return fail("masih_ada_tagihan");
      if ((await d.repo.countTopupSince(a.profile.id, iso(sekarang - 24 * 3600 * 1000))) >= TOPUP_MAKS_PER_HARI) return fail("terlalu_sering");

      for (const kode of acakKode().slice(0, 40)) {
        const total = nominal + kode;
        const tofUnits = Number((BigInt(total) * 1000000n) / BigInt(s.kurs)); // 6 desimal
        const hasil = await d.repo.insertTopup({
          profile_id: a.profile.id, nominal_rp: nominal, kode_unik: kode, total_rp: total,
          kurs_rp_per_tof: s.kurs, tof_units: tofUnits, status: "menunggu",
          dibuat: iso(sekarang), kedaluwarsa_pada: iso(sekarang + TOPUP_TTL_MS),
        });
        if (hasil.result === "ok" && hasil.row) {
          await d.repo.logTopup(hasil.row.id, a.profile.id, "buat", a.profile.id, { total_rp: total, tof_units: tofUnits });
          return ok({ topup: tampilTopup(hasil.row) });
        }
        if (hasil.result === "error") return fail("server_error");
      }
      return fail("kode_unik_habis");
    }

    case "topup_saya": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      await d.repo.expireTopups(iso(d.now()));
      return ok({ daftar: (await d.repo.listTopupByProfile(a.profile.id, 20)).map(tampilTopup) });
    }

    case "topup_dibayar": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      const row = typeof body.id === "string" ? await d.repo.getTopup(body.id) : null;
      if (!row || row.profile_id !== a.profile.id) return fail("not_found");
      const baru = await d.repo.updateTopupIf(row.id, ["menunggu"], { status: "dibayar", ref_user: teks(body.ref, 60) || null });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(row.id, a.profile.id, "dibayar", a.profile.id, { ref: baru.ref_user });
      return ok({ topup: tampilTopup(baru) });
    }

    case "topup_batal": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      const row = typeof body.id === "string" ? await d.repo.getTopup(body.id) : null;
      if (!row || row.profile_id !== a.profile.id) return fail("not_found");
      const baru = await d.repo.updateTopupIf(row.id, ["menunggu"], { status: "dibatalkan" });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(row.id, a.profile.id, "batal", a.profile.id, {});
      return ok({ topup: tampilTopup(baru) });
    }

    // ---- pengurus ----
    case "admin_topup_daftar": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      await d.repo.expireTopups(iso(d.now()));
      const tampil = body.tampil === "perlu_kirim" ? ["dikonfirmasi", "mengirim"]
        : body.tampil === "riwayat" ? ["selesai", "ditolak", "dibatalkan", "kedaluwarsa"]
        : ["menunggu", "dibayar"];
      const rows = await d.repo.listTopupByStatus(tampil, 100);
      const setelan = await ambilPengaturan(d);
      const nama = new Map<string, string>();
      for (const r of rows) {
        if (!nama.has(r.profile_id)) nama.set(r.profile_id, (await d.repo.findProfileById(r.profile_id))?.username || "");
      }
      return ok({ daftar: rows.map((r) => ({ ...tampilAdmin(r), profile_id: r.profile_id, username: nama.get(r.profile_id) || "", catatan_transaksi: catatanNabung(nama.get(r.profile_id) || "", r.profile_id), dikonfirmasi_oleh: r.dikonfirmasi_oleh })), mode_kirim: setelan.mode_kirim, alamat_penampung: setelan.alamat_penampung });
    }

    case "admin_topup_konfirmasi": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const row = typeof body.id === "string" ? await d.repo.getTopup(body.id) : null;
      if (!row) return fail("not_found");
      // pemisahan tugas: bila ada lebih dari satu pengurus, tidak boleh mengonfirmasi setoran sendiri
      if (row.profile_id === a.profile.id && (d.adminIds || []).length > 1) return fail("tidak_boleh_konfirmasi_sendiri");
      if (Date.parse(row.kedaluwarsa_pada) < d.now()) { await d.repo.expireTopups(iso(d.now())); return fail("kedaluwarsa"); }
      const baru = await d.repo.updateTopupIf(row.id, ["menunggu", "dibayar"], {
        status: "dikonfirmasi", dikonfirmasi_oleh: a.profile.id, dikonfirmasi_pada: iso(d.now()),
        catatan_admin: teks(body.catatan, 200) || null,
      });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(row.id, row.profile_id, "konfirmasi", a.profile.id, { total_rp: row.total_rp });
      const payout = await jalankanPayout(baru, a.profile.id, d);
      const terbaru = (await d.repo.getTopup(row.id)) || baru;
      return ok({ topup: tampilAdmin(terbaru), payout });
    }

    case "admin_topup_tolak": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const alasan = teks(body.alasan, 200);
      if (!alasan) return fail("alasan_wajib");
      const row = typeof body.id === "string" ? await d.repo.getTopup(body.id) : null;
      if (!row) return fail("not_found");
      const baru = await d.repo.updateTopupIf(row.id, ["menunggu", "dibayar"], { status: "ditolak", catatan_admin: alasan, dikonfirmasi_oleh: a.profile.id, dikonfirmasi_pada: iso(d.now()) });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(row.id, row.profile_id, "tolak", a.profile.id, { alasan });
      return ok({ topup: tampilTopup(baru) });
    }

    // Setelah TOF dikirim on-chain dari dompet kas, pengurus mencatat ID transaksinya
    case "admin_topup_selesai": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const txid = teks(body.txid, 60).toUpperCase();
      if (!TXID_RE.test(txid)) return fail("bad_txid");
      const row = typeof body.id === "string" ? await d.repo.getTopup(body.id) : null;
      if (!row) return fail("not_found");
      if ((await d.repo.listTopupByStatus(["selesai", "ditampung"], 1000)).some((r) => r.tof_txid === txid)) return fail("txid_sudah_dipakai");
      // Mode tampung: pengiriman manual ke dompet penampung berarti 'ditampung'; mode langsung: 'selesai'
      const modeManual = (await ambilPengaturan(d)).mode_kirim;
      const baru = await d.repo.updateTopupIf(row.id, ["dikonfirmasi", "mengirim"], modeManual === "tampung"
        ? { status: "ditampung", tof_txid: txid, ditampung_pada: iso(d.now()), jalur: "tampung" }
        : { status: "selesai", tof_txid: txid, selesai_pada: iso(d.now()), selesai_oleh: a.profile.id });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(row.id, row.profile_id, "selesai", a.profile.id, { txid, tof_units: row.tof_units });
      return ok({ topup: tampilTopup(baru) });
    }

    // Coba kirim ulang otomatis (mis. setelah penerima opt-in atau dompet pembayar diisi ulang)
    case "admin_topup_kirim_ulang": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const row = typeof body.id === "string" ? await d.repo.getTopup(body.id) : null;
      if (!row) return fail("not_found");
      if (row.status !== "dikonfirmasi") return fail("status_tidak_cocok");
      const payout = await jalankanPayout(row, a.profile.id, d);
      return ok({ payout, topup: tampilAdmin((await d.repo.getTopup(row.id)) || row) });
    }

    // Periksa status transaksi yang masih 'mengirim'
    case "admin_topup_periksa": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const row = typeof body.id === "string" ? await d.repo.getTopup(body.id) : null;
      if (!row) return fail("not_found");
      if (row.status !== "mengirim") return fail("status_tidak_cocok");
      if (!row.tof_txid) return fail("txid_belum_ada");
      if (!d.chain) return fail("kas_belum_diatur");
      const st = await d.chain.status(row.tof_txid);
      if (st === "confirmed") {
        await d.repo.updateTopupIf(row.id, ["mengirim"], patchSetelahTerkirim(row.jalur, a.profile.id, d));
        await d.repo.logTopup(row.id, row.profile_id, row.jalur === "tampung" ? "ditampung_otomatis" : "selesai_otomatis", a.profile.id, { txid: row.tof_txid });
      } else if (st === "rejected") {
        await kembalikanKeDikonfirmasi(d, row.id, "Transaksi ditolak jaringan. Coba kirim ulang.");
      }
      return ok({ hasil: st, topup: tampilAdmin((await d.repo.getTopup(row.id)) || row) });
    }

    // Pengurus memutuskan sendiri mengembalikan tagihan dari 'mengirim' ke 'dikonfirmasi' (setelah memeriksa explorer)
    case "admin_topup_reset_kirim": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      if (body.yakin !== true) return fail("konfirmasi_wajib");
      const row = typeof body.id === "string" ? await d.repo.getTopup(body.id) : null;
      if (!row) return fail("not_found");
      const baru = await d.repo.updateTopupIf(row.id, ["mengirim"], { status: "dikonfirmasi", kirim_catatan: "Dikembalikan manual oleh pengurus untuk dikirim ulang.", tof_txid: null, auto_kirim_pada: null });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(row.id, row.profile_id, "reset_kirim", a.profile.id, { txid_sebelumnya: row.tof_txid });
      return ok({ topup: tampilAdmin(baru) });
    }

    case "admin_pengaturan_ambil": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const s = await ambilPengaturan(d);
      let kas: Record<string, unknown> | null = null;
      const alamat = d.chain?.payoutAddress() ?? null;
      if (d.chain && alamat) {
        kas = { alamat };
        try {
          const ac = await d.chain.getAccount(alamat);
          kas = { alamat, algo: Number(ac.algo), min_saldo: Number(ac.minBal), tof: Number(ac.tof), tof_optin: ac.tofOptin };
        } catch (e) { console.error("saldo kas:", e); kas = { alamat, galat: true }; }
      }
      const terpakai = await d.repo.sumTofAutoSince(iso(d.now() - 24 * 3600 * 1000));
      return ok({
        pengaturan: { kurs: s.kurs, min_rp: s.min_rp, maks_rp: s.maks_rp, aktif: s.aktif, nama_penerima: s.nama_penerima, aturan: s.aturan, qris: s.qris,
          auto_kirim: s.auto_kirim, batas_harian_tof: s.batas_harian_tof, batas_transaksi_tof: s.batas_transaksi_tof, terpakai_24j: terpakai,
          mode_kirim: s.mode_kirim, alamat_penampung: s.alamat_penampung, ambang_batch_tof: s.ambang_batch_tof,
          tarik_aktif: s.tarik_aktif, alamat_tarik: s.alamat_tarik, min_tarik_tof: s.min_tarik_tof, maks_tarik_tof: s.maks_tarik_tof },
        kas,
      });
    }

    case "admin_pengaturan_simpan": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const nilai: Record<string, unknown> = {};
      const bil = (v: unknown, maks: number): number | null => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= maks ? (v as number) : null);
      if ("kurs_rp_per_tof" in body) { const n = bil(body.kurs_rp_per_tof, 1000000); if (n === null) return fail("kurs_tidak_valid"); nilai.kurs_rp_per_tof = n; }
      if ("min_rp" in body) { const n = bil(body.min_rp, 100000000); if (n === null) return fail("batas_tidak_valid"); nilai.min_rp = n; }
      if ("maks_rp" in body) { const n = bil(body.maks_rp, 1000000000); if (n === null) return fail("batas_tidak_valid"); nilai.maks_rp = n; }
      const cur = await ambilPengaturan(d);
      if ((nilai.maks_rp ?? cur.maks_rp) < (nilai.min_rp ?? cur.min_rp)) return fail("batas_tidak_valid");
      if ("batas_harian_tof" in body) { const n = bil(body.batas_harian_tof, 1000000000); if (n === null) return fail("batas_kirim_tidak_valid"); nilai.batas_harian_tof = n; }
      if ("batas_transaksi_tof" in body) { const n = bil(body.batas_transaksi_tof, 1000000000); if (n === null) return fail("batas_kirim_tidak_valid"); nilai.batas_transaksi_tof = n; }
      if (((nilai.batas_transaksi_tof as number | undefined) ?? cur.batas_transaksi_tof) > ((nilai.batas_harian_tof as number | undefined) ?? cur.batas_harian_tof)) return fail("batas_kirim_tidak_valid");
      if ("auto_kirim" in body) {
        if (body.auto_kirim === true && !(d.chain && d.chain.payoutAddress())) return fail("kas_belum_diatur");
        nilai.auto_kirim = body.auto_kirim === true;
      }
      if ("mode_kirim" in body) {
        if (body.mode_kirim !== "tampung" && body.mode_kirim !== "langsung") return fail("mode_tidak_valid");
        nilai.mode_kirim = body.mode_kirim;
      }
      if ("alamat_penampung" in body) {
        const x = teks(body.alamat_penampung, 80);
        if (x && !d.isValidAddress(x)) return fail("alamat_tidak_valid");
        nilai.alamat_penampung = x;
      }
      if ("ambang_batch_tof" in body) { const n = bil(body.ambang_batch_tof, 1000000000); if (n === null) return fail("ambang_tidak_valid"); nilai.ambang_batch_tof = n; }
      {
        const modeAkhir = (nilai.mode_kirim as string | undefined) ?? cur.mode_kirim;
        const penampungAkhir = "alamat_penampung" in nilai ? (nilai.alamat_penampung as string) : cur.alamat_penampung;
        const autoAkhir = "auto_kirim" in nilai ? nilai.auto_kirim === true : cur.auto_kirim;
        if (autoAkhir && modeAkhir === "tampung" && !penampungAkhir) return fail("penampung_belum_diatur");
      }
      if ("alamat_tarik" in body) {
        const x = teks(body.alamat_tarik, 80);
        if (x && !d.isValidAddress(x)) return fail("alamat_tidak_valid");
        nilai.alamat_tarik = x;
      }
      if ("min_tarik_tof" in body) { const n = bil(body.min_tarik_tof, 1000000000); if (n === null) return fail("batas_tarik_tidak_valid"); nilai.min_tarik_tof = n; }
      if ("maks_tarik_tof" in body) { const n = bil(body.maks_tarik_tof, 1000000000); if (n === null) return fail("batas_tarik_tidak_valid"); nilai.maks_tarik_tof = n; }
      if (((nilai.maks_tarik_tof as number | undefined) ?? cur.maks_tarik_tof) < ((nilai.min_tarik_tof as number | undefined) ?? cur.min_tarik_tof)) return fail("batas_tarik_tidak_valid");
      if ("tarik_aktif" in body) {
        const alamatAkhir = "alamat_tarik" in nilai ? (nilai.alamat_tarik as string) : cur.alamat_tarik;
        if (body.tarik_aktif === true && !alamatAkhir) return fail("alamat_tarik_belum_diatur");
        nilai.tarik_aktif = body.tarik_aktif === true;
      }
      if ("aktif" in body) nilai.aktif = body.aktif === true;
      if ("nama_penerima" in body) nilai.nama_penerima = teks(body.nama_penerima, 80);
      if ("aturan" in body) nilai.aturan = teks(body.aturan, 1500);
      if ("qris" in body) {
        if (typeof body.qris !== "string" || body.qris.length > 600000 || !QRIS_RE.test(body.qris)) return fail("qris_tidak_valid");
        nilai.qris = body.qris;
      }
      if (Object.keys(nilai).length === 0) return fail("tidak_ada_perubahan");
      await d.repo.saveSettings(nilai, a.profile.id);
      await d.repo.log(a.profile.id, "pengaturan_topup", true);
      return ok();
    }

    // ================= PENAMPUNGAN & PEMBAGIAN BATCH =================
    // Ringkasan pool (TOF yang ditampung), setoran bebas, dan batch yang sedang terbuka
    case "admin_batch_status": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const s = await ambilPengaturan(d);
      const ditampung = await d.repo.listDitampung();
      const bebas = ditampung.filter((r) => !r.batch_id);
      const batch = await d.repo.getBatchTerbuka();
      const rowsBatch = batch ? await d.repo.listTopupByBatch(batch.id) : [];
      const nama = await namaProfil(d, [...bebas, ...rowsBatch].map((r) => r.profile_id));
      const jml = (rs: TopupRow[]) => rs.reduce((n, r) => n + Number(r.tof_units), 0);
      return ok({
        ambang_tof: s.ambang_batch_tof, alamat_penampung: s.alamat_penampung, mode_kirim: s.mode_kirim,
        pool_units: jml(ditampung), pool_bebas_units: jml(bebas), jumlah_bebas: bebas.length,
        bebas: bebas.slice(0, 200).map((r) => ({ id: r.id, username: nama.get(r.profile_id) || "", tof_units: r.tof_units, total_rp: r.total_rp })),
        batch: batch ? tampilBatch(batch) : null,
        items: batch ? rowsBatch.map((r) => itemBatch(r, batch.nomor, nama)) : [],
      });
    }

    // Kumpulkan semua setoran yang tertampung menjadi satu batch (hanya jika sudah mencapai ambang)
    case "admin_batch_siapkan": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const s = await ambilPengaturan(d);
      if (await d.repo.getBatchTerbuka()) return fail("batch_masih_terbuka");
      const bebas = (await d.repo.listDitampung()).filter((r) => !r.batch_id);
      const total = bebas.reduce((n, r) => n + Number(r.tof_units), 0);
      if (total < s.ambang_batch_tof * 1000000) return fail("belum_cukup", { pool_units: total, ambang_tof: s.ambang_batch_tof });
      const ins = await d.repo.insertBatch({ status: "disiapkan", dibuat_oleh: a.profile.id, dibuat: iso(d.now()) });
      if (ins.result === "duplicate") return fail("batch_masih_terbuka");
      if (ins.result !== "ok" || !ins.row) return fail("server_error");
      const masuk = await d.repo.assignBatch(bebas.map((r) => r.id), ins.row.id);
      if (masuk.length === 0) { await d.repo.updateBatchIf(ins.row.id, ["disiapkan"], { status: "dibatalkan" }); return fail("belum_cukup"); }
      const batch = (await d.repo.updateBatchIf(ins.row.id, ["disiapkan"], { total_tof_units: masuk.reduce((n, r) => n + Number(r.tof_units), 0), jumlah_item: masuk.length })) || ins.row;
      await d.repo.logTopup(null, a.profile.id, "batch_siapkan", a.profile.id, { batch: batch.nomor, jumlah: masuk.length, total_tof_units: batch.total_tof_units });
      const nama = await namaProfil(d, masuk.map((r) => r.profile_id));
      return ok({ batch: tampilBatch(batch), items: masuk.map((r) => itemBatch(r, batch.nomor, nama)) });
    }

    // Batalkan batch yang BELUM dinyatakan ditopup ke akun investasi (setoran kembali ke pool)
    case "admin_batch_batalkan": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const batch = typeof body.batch_id === "string" ? await d.repo.getBatch(body.batch_id) : null;
      if (!batch) return fail("not_found");
      const baru = await d.repo.updateBatchIf(batch.id, ["disiapkan"], { status: "dibatalkan" });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.releaseBatch(batch.id);
      await d.repo.logTopup(null, a.profile.id, "batch_batal", a.profile.id, { batch: batch.nomor });
      return ok({ batch: tampilBatch(baru) });
    }

    // Pengurus menyatakan uang batch SUDAH ditopup ke akun investasi sungguhan → pembagian TOF boleh dimulai
    case "admin_batch_topup_investasi": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const batch = typeof body.batch_id === "string" ? await d.repo.getBatch(body.batch_id) : null;
      if (!batch) return fail("not_found");
      const baru = await d.repo.updateBatchIf(batch.id, ["disiapkan"], { status: "siap_dibagikan", investasi_oleh: a.profile.id, investasi_pada: iso(d.now()), investasi_catatan: teks(body.catatan, 300) || null });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(null, a.profile.id, "batch_topup_investasi", a.profile.id, { batch: batch.nomor, catatan: baru.investasi_catatan });
      return ok({ batch: tampilBatch(baru) });
    }

    // Daftar isi batch (untuk alat kirim massal di browser pengurus)
    case "admin_batch_ambil": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const batch = typeof body.batch_id === "string" ? await d.repo.getBatch(body.batch_id) : null;
      if (!batch) return fail("not_found");
      const rows = await d.repo.listTopupByBatch(batch.id);
      const nama = await namaProfil(d, rows.map((r) => r.profile_id));
      return ok({ batch: tampilBatch(batch), items: rows.map((r) => itemBatch(r, batch.nomor, nama)), alamat_penampung: (await ambilPengaturan(d)).alamat_penampung });
    }

    // Mencatat hasil pembagian (ID transaksi per setoran). Server memastikan tiap transaksi benar-benar terkonfirmasi.
    case "admin_batch_catat": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const batch = typeof body.batch_id === "string" ? await d.repo.getBatch(body.batch_id) : null;
      if (!batch) return fail("not_found");
      if (batch.status !== "siap_dibagikan") return fail("batch_belum_siap");
      const hasil = Array.isArray(body.hasil) ? (body.hasil as unknown[]).slice(0, 50) : [];
      if (hasil.length === 0) return fail("hasil_kosong");
      const baris = new Map((await d.repo.listTopupByBatch(batch.id)).map((r) => [r.id, r]));
      const tercatat: string[] = [];
      const belum: { id: string; alasan: string }[] = [];
      for (const h of hasil as { id?: unknown; txid?: unknown }[]) {
        const id = typeof h?.id === "string" ? h.id : "";
        const r = baris.get(id);
        const txid = teks(h?.txid, 60).toUpperCase();
        if (!r) { belum.push({ id, alasan: "bukan bagian batch ini" }); continue; }
        if (r.status !== "ditampung") { belum.push({ id, alasan: "sudah tercatat" }); continue; }
        if (!TXID_RE.test(txid)) { belum.push({ id, alasan: "ID transaksi tidak valid" }); continue; }
        if (d.chain) {
          const st = await d.chain.status(txid).catch(() => "unknown" as const);
          if (st !== "confirmed") { belum.push({ id, alasan: "belum terkonfirmasi di jaringan" }); continue; }
        }
        const baru = await d.repo.updateTopupIf(id, ["ditampung"], { status: "selesai", txid_distribusi: txid, distribusi_pada: iso(d.now()), selesai_pada: iso(d.now()), selesai_oleh: a.profile.id });
        if (!baru) { belum.push({ id, alasan: "status berubah" }); continue; }
        await d.repo.logTopup(id, r.profile_id, "distribusi", a.profile.id, { batch: batch.nomor, txid, tof_units: r.tof_units });
        tercatat.push(id);
      }
      const sisa = (await d.repo.listTopupByBatch(batch.id)).filter((r) => r.status === "ditampung");
      let selesai = false;
      if (sisa.length === 0) {
        await d.repo.updateBatchIf(batch.id, ["siap_dibagikan"], { status: "selesai", selesai_pada: iso(d.now()) });
        await d.repo.logTopup(null, a.profile.id, "batch_selesai", a.profile.id, { batch: batch.nomor });
        selesai = true;
      }
      return ok({ tercatat, belum, batch_selesai: selesai });
    }

    // ================= TARIK DANA (WITHDRAW) =================
    // Anggota mengirim TOF ke dompet pengurus; setelah terbukti di blockchain, pengurus mengirim uang ke e-wallet/rekening anggota.
    case "tarik_buat": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      const s = await ambilPengaturan(d);
      if (!(s.tarik_aktif && s.alamat_tarik)) return fail("tarik_nonaktif");
      if (a.profile.id === s.alamat_tarik) return fail("alamat_tarik_sama");
      const units = Number(body.jumlah_units);
      if (!Number.isSafeInteger(units) || units < s.min_tarik_tof * 1000000 || units > s.maks_tarik_tof * 1000000) {
        return fail("jumlah_tidak_valid", { min_tarik_tof: s.min_tarik_tof, maks_tarik_tof: s.maks_tarik_tof });
      }
      const tujuan = cekTujuanTarik(body);
      if ("error" in tujuan) return fail(tujuan.error);
      const sekarang = d.now();
      await d.repo.expireTarik(iso(sekarang));
      if ((await d.repo.countTarikActive(a.profile.id)) > 0) return fail("masih_ada_penarikan");
      if ((await d.repo.countTarikSince(a.profile.id, iso(sekarang - 24 * 3600 * 1000))) >= 5) return fail("terlalu_sering");
      if (!d.chain) return fail("chain_tidak_tersedia");
      let saldo;
      try { saldo = await d.chain.getAccount(a.profile.id); } catch { return fail("gagal_baca_saldo"); }
      if (!saldo.tofOptin || saldo.tof < BigInt(units)) return fail("saldo_tof_kurang", { saldo_units: Number(saldo.tof) });
      const rp = Number((BigInt(units) * BigInt(s.kurs)) / 1000000n);
      const ins = await d.repo.insertTarik({
        profile_id: a.profile.id, jumlah_tof_units: units, kurs_rp_per_tof: s.kurs, jumlah_rp: rp,
        tujuan_jenis: tujuan.jenis, tujuan_nomor: tujuan.nomor, tujuan_nama: tujuan.nama, alamat_tarik: s.alamat_tarik,
        status: "menunggu_tof", dibuat: iso(sekarang), kedaluwarsa_pada: iso(sekarang + 6 * 3600 * 1000),
      });
      if (ins.result !== "ok" || !ins.row) return fail("server_error");
      await d.repo.logTopup(ins.row.id, a.profile.id, "tarik_buat", a.profile.id, { tof_units: units, rp });
      return ok({ tarik: tampilTarik(ins.row), alamat_tarik: s.alamat_tarik, catatan_transaksi: catatanTarik(a.profile.username, a.profile.id) });
    }

    // Anggota melaporkan ID transaksi TOF-nya; server memeriksa langsung di blockchain
    case "tarik_tof_terkirim": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      const row = typeof body.id === "string" ? await d.repo.getTarik(body.id) : null;
      if (!row || row.profile_id !== a.profile.id) return fail("not_found");
      const txid = teks(body.txid, 60).toUpperCase();
      if (!TXID_RE.test(txid)) return fail("bad_txid");
      if (row.status !== "menunggu_tof" && row.status !== "tof_dikirim") return fail("status_tidak_cocok");
      if (await d.repo.txidTarikSudahAda(txid, row.id)) return fail("txid_sudah_dipakai");
      const baru = await verifikasiTarik(row, txid, d);
      await d.repo.logTopup(row.id, a.profile.id, "tarik_tof_terkirim", a.profile.id, { txid, status: baru.status });
      return ok({ tarik: tampilTarik(baru) });
    }

    // Anggota memeriksa ulang (mis. transaksi belum terindeks saat pertama dilaporkan)
    case "tarik_periksa": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      const row = typeof body.id === "string" ? await d.repo.getTarik(body.id) : null;
      if (!row || row.profile_id !== a.profile.id) return fail("not_found");
      if (row.status !== "tof_dikirim" || !row.tof_txid) return fail("status_tidak_cocok");
      return ok({ tarik: tampilTarik(await verifikasiTarik(row, row.tof_txid, d)) });
    }

    case "tarik_saya": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      await d.repo.expireTarik(iso(d.now()));
      return ok({ daftar: (await d.repo.listTarikByProfile(a.profile.id, 20)).map(tampilTarik) });
    }

    // Batalkan selama TOF belum dikirim
    case "tarik_batal": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      const row = typeof body.id === "string" ? await d.repo.getTarik(body.id) : null;
      if (!row || row.profile_id !== a.profile.id) return fail("not_found");
      const baru = await d.repo.updateTarikIf(row.id, ["menunggu_tof"], { status: "dibatalkan" });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(row.id, a.profile.id, "tarik_batal", a.profile.id, {});
      return ok({ tarik: tampilTarik(baru) });
    }

    // ---- pengurus ----
    case "admin_tarik_daftar": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      await d.repo.expireTarik(iso(d.now()));
      const tampil = body.tampil === "perlu_dibayar" ? ["tof_diterima"]
        : body.tampil === "riwayat" ? ["dibayar", "ditolak", "dibatalkan", "kedaluwarsa"]
        : ["menunggu_tof", "tof_dikirim"];
      const rows = await d.repo.listTarikByStatus(tampil, 100);
      const nama = await namaProfil(d, rows.map((r) => r.profile_id));
      return ok({ daftar: rows.map((r) => ({ ...tampilTarik(r), username: nama.get(r.profile_id) || "", catatan_admin: r.catatan_admin, dibayar_oleh: r.dibayar_oleh })) });
    }

    // Verifikasi ulang; pengurus boleh menambahkan ID transaksi bila anggota belum melaporkannya
    case "admin_tarik_verifikasi": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const row = typeof body.id === "string" ? await d.repo.getTarik(body.id) : null;
      if (!row) return fail("not_found");
      if (row.status !== "menunggu_tof" && row.status !== "tof_dikirim") return fail("status_tidak_cocok");
      const txid = teks(body.txid, 60).toUpperCase() || row.tof_txid || "";
      if (!TXID_RE.test(txid)) return fail(txid ? "bad_txid" : "txid_belum_ada");
      if (await d.repo.txidTarikSudahAda(txid, row.id)) return fail("txid_sudah_dipakai");
      const baru = await verifikasiTarik(row, txid, d);
      await d.repo.logTopup(row.id, row.profile_id, "tarik_verifikasi", a.profile.id, { txid, status: baru.status });
      return ok({ tarik: tampilTarik(baru) });
    }

    // Uang sudah dikirim pengurus (DANA/rekening) ke tujuan anggota
    case "admin_tarik_dibayar": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const ref = teks(body.ref, 100);
      if (!ref) return fail("ref_wajib");
      const row = typeof body.id === "string" ? await d.repo.getTarik(body.id) : null;
      if (!row) return fail("not_found");
      if (row.profile_id === a.profile.id && (d.adminIds || []).length > 1) return fail("tidak_boleh_proses_sendiri");
      const baru = await d.repo.updateTarikIf(row.id, ["tof_diterima"], { status: "dibayar", ref_bayar: ref, dibayar_oleh: a.profile.id, dibayar_pada: iso(d.now()) });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(row.id, row.profile_id, "tarik_dibayar", a.profile.id, { rp: row.jumlah_rp, ref });
      return ok({ tarik: tampilTarik(baru) });
    }

    // Tolak. Bila TOF sudah diterima pengurus, TOF harus dikembalikan manual (lihat 'kembalikan_tof').
    case "admin_tarik_tolak": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const alasan = teks(body.alasan, 200);
      if (!alasan) return fail("alasan_wajib");
      const row = typeof body.id === "string" ? await d.repo.getTarik(body.id) : null;
      if (!row) return fail("not_found");
      const baru = await d.repo.updateTarikIf(row.id, ["menunggu_tof", "tof_dikirim", "tof_diterima"], { status: "ditolak", catatan_admin: alasan });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(row.id, row.profile_id, "tarik_tolak", a.profile.id, { alasan, status_sebelumnya: row.status });
      return ok({ tarik: tampilTarik(baru), kembalikan_tof: row.status === "tof_diterima" || (row.status === "tof_dikirim" && !!row.tof_txid) });
    }

    default:
      return fail("unknown_action");
  }
}

async function namaProfil(d: Deps, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (const id of new Set(ids)) m.set(id, (await d.repo.findProfileById(id))?.username || "");
  return m;
}

const TOF_TARIK_JENIS = ["DANA", "GoPay", "OVO", "ShopeePay", "LinkAja"];

function catatanTarik(username: string, address: string): string {
  return (username || "-") + " # " + address + " # tarik dana";
}

function tampilTarik(r: TarikRow) {
  return {
    id: r.id, jumlah_tof_units: r.jumlah_tof_units, jumlah_rp: r.jumlah_rp, kurs_rp_per_tof: r.kurs_rp_per_tof,
    tujuan_jenis: r.tujuan_jenis, tujuan_nomor: r.tujuan_nomor, tujuan_nama: r.tujuan_nama, alamat_tarik: r.alamat_tarik,
    status: r.status, tof_txid: r.tof_txid, catatan_sistem: r.catatan_sistem, catatan_admin: r.catatan_admin, ref_bayar: r.ref_bayar,
    dibuat: r.dibuat, kedaluwarsa_pada: r.kedaluwarsa_pada, profile_id: r.profile_id,
  };
}

function cekTujuanTarik(body: Row): { jenis: string; nomor: string; nama: string } | { error: string } {
  const jenis = teks(body.jenis, 40);
  const bank = /^Bank [A-Za-z0-9 .&-]{2,30}$/.test(jenis);
  if (!bank && !TOF_TARIK_JENIS.includes(jenis)) return { error: "jenis_tidak_valid" };
  const nomor = String(body.nomor ?? "").replace(/[\s-]/g, "");
  if (!/^\d{5,25}$/.test(nomor)) return { error: "nomor_tidak_valid" };
  const nama = teks(body.nama, 60);
  if (!/^[A-Za-z0-9 .,'-]{2,60}$/.test(nama)) return { error: "nama_tidak_valid" };
  return { jenis, nomor, nama };
}

// Memeriksa transfer TOF anggota ke dompet pengurus langsung di blockchain:
// harus terkonfirmasi, dari akun anggota, ke dompet penarikan, aset TOF, dan jumlah PERSIS sama.
async function verifikasiTarik(row: TarikRow, txid: string, d: Deps): Promise<TarikRow> {
  const tersimpan = await d.repo.updateTarikIf(row.id, ["menunggu_tof", "tof_dikirim"], { status: "tof_dikirim", tof_txid: txid });
  if (!tersimpan) return (await d.repo.getTarik(row.id)) || row;
  if (!d.chain) return tersimpan;
  let tr: Awaited<ReturnType<Chain["getTransfer"]>>;
  try { tr = await d.chain.getTransfer(txid); } catch { tr = { status: "pending" }; }
  const catat = async (teksCatatan: string | null) => (await d.repo.updateTarikIf(row.id, ["tof_dikirim"], { catatan_sistem: teksCatatan })) || tersimpan;
  if (tr.status !== "confirmed") return await catat("Transaksi belum terkonfirmasi/terindeks di jaringan. Periksa lagi sebentar lagi.");
  const salah: string[] = [];
  if (tr.sender !== row.profile_id) salah.push("pengirim bukan pemilik akun");
  if (tr.receiver !== row.alamat_tarik) salah.push("penerima bukan dompet penarikan");
  if (!tr.isTof) salah.push("aset bukan TOF");
  if (tr.amount !== BigInt(row.jumlah_tof_units)) salah.push("jumlah tidak sama dengan permintaan");
  if (salah.length) return await catat("Tidak cocok: " + salah.join(", ") + ".");
  return (await d.repo.updateTarikIf(row.id, ["tof_dikirim"], { status: "tof_diterima", tof_diterima_pada: iso(d.now()), catatan_sistem: null })) || tersimpan;
}

function tampilBatch(b: BatchRow) {
  return { id: b.id, nomor: b.nomor, status: b.status, total_tof_units: b.total_tof_units, jumlah_item: b.jumlah_item, dibuat: b.dibuat, investasi_pada: b.investasi_pada, investasi_catatan: b.investasi_catatan };
}

// Catatan transaksi pembagian: "USERNAME # ALAMAT # nabung receh # batch N"
function itemBatch(r: TopupRow, nomor: number, nama: Map<string, string>) {
  const u = nama.get(r.profile_id) || "";
  return { id: r.id, profile_id: r.profile_id, username: u, tof_units: r.tof_units, total_rp: r.total_rp, status: r.status, txid_distribusi: r.txid_distribusi ?? null, catatan_distribusi: catatanNabung(u, r.profile_id) + " # batch " + nomor };
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
//   ADMIN_IDS         = alamat dompet pengurus Nabung TOF, dipisah koma
//   PAYOUT_MNEMONIC   = 25 kata dompet PEMBAYAR khusus (opsional; untuk kirim TOF otomatis)
//   ALLOWED_ORIGINS   = (opsional) daftar origin dipisah koma
// SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY sudah otomatis tersedia.
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MASTER_KEY = Deno.env.get("VAULT_MASTER_KEY") ?? "";
const PEPPER = Deno.env.get("PIN_PEPPER") ?? "";
const INDEXER = Deno.env.get("INDEXER_URL") ?? "https://mainnet-idx.algonode.cloud";
const ALGOD = Deno.env.get("ALGOD_URL") ?? "https://mainnet-api.algonode.cloud";
const TOF_ASSET_ID = Number(Deno.env.get("TOF_ASSET_ID") ?? "3558306283");
const PAYOUT_MNEMONIC = (Deno.env.get("PAYOUT_MNEMONIC") ?? "").trim();
const ADMIN_IDS = (Deno.env.get("ADMIN_IDS") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
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

  // ---------------- Nabung TOF ----------------
  async getSettings() {
    const rows = must(await db.from("app_settings").select("key,value")) as { key: string; value: unknown }[];
    const out: Record<string, unknown> = {};
    for (const r of rows || []) out[r.key] = r.value;
    return out;
  },
  async saveSettings(values, by) {
    const now = new Date().toISOString();
    const rows = Object.entries(values).map(([key, value]) => ({ key, value, updated_at: now, updated_by: by }));
    must(await db.from("app_settings").upsert(rows, { onConflict: "key" }));
  },
  async expireTopups(nowIso) {
    must(await db.from("topup_requests").update({ status: "kedaluwarsa" })
      .in("status", ["menunggu", "dibayar"]).lt("kedaluwarsa_pada", nowIso));
  },
  async insertTopup(row) {
    const { data, error } = await db.from("topup_requests").insert(row).select().single();
    if (!error) return { result: "ok", row: data as TopupRow };
    if (error.code === "23505") return { result: "duplicate" }; // total_rp sudah dipakai tagihan aktif lain
    console.error("insertTopup:", error.message);
    return { result: "error" };
  },
  async getTopup(id) {
    return must(await db.from("topup_requests").select("*").eq("id", id).maybeSingle()) as TopupRow | null;
  },
  async updateTopupIf(id, expect, patch) {
    // compare-and-set: hanya berubah bila status masih sesuai (mencegah konfirmasi ganda)
    return must(await db.from("topup_requests").update(patch).eq("id", id).in("status", expect).select().maybeSingle()) as TopupRow | null;
  },
  async listTopupByProfile(profileId, limit) {
    return must(await db.from("topup_requests").select("*").eq("profile_id", profileId).order("dibuat", { ascending: false }).limit(limit)) as TopupRow[];
  },
  async listTopupByStatus(statuses, limit) {
    return must(await db.from("topup_requests").select("*").in("status", statuses).order("dibuat", { ascending: false }).limit(limit)) as TopupRow[];
  },
  async countTopupActive(profileId) {
    const { count, error } = await db.from("topup_requests").select("id", { count: "exact", head: true })
      .eq("profile_id", profileId).in("status", ["menunggu", "dibayar"]);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  async countTopupSince(profileId, sinceIso) {
    const { count, error } = await db.from("topup_requests").select("id", { count: "exact", head: true })
      .eq("profile_id", profileId).gte("dibuat", sinceIso);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  // ---------------- Tarik dana ----------------
  async insertTarik(row) {
    const { data, error } = await db.from("tarik_requests").insert(row).select().single();
    if (error) { console.error("insertTarik:", error.message); return { result: "error" }; }
    return { result: "ok", row: data as TarikRow };
  },
  async getTarik(id) {
    return must(await db.from("tarik_requests").select("*").eq("id", id).maybeSingle()) as TarikRow | null;
  },
  async updateTarikIf(id, expect, patch) {
    return must(await db.from("tarik_requests").update(patch).eq("id", id).in("status", expect).select().maybeSingle()) as TarikRow | null;
  },
  async listTarikByProfile(profileId, limit) {
    return must(await db.from("tarik_requests").select("*").eq("profile_id", profileId).order("dibuat", { ascending: false }).limit(limit)) as TarikRow[];
  },
  async listTarikByStatus(statuses, limit) {
    return must(await db.from("tarik_requests").select("*").in("status", statuses).order("dibuat", { ascending: true }).limit(limit)) as TarikRow[];
  },
  async countTarikActive(profileId) {
    const { count, error } = await db.from("tarik_requests").select("id", { count: "exact", head: true })
      .eq("profile_id", profileId).in("status", ["menunggu_tof", "tof_dikirim", "tof_diterima"]);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  async countTarikSince(profileId, sinceIso) {
    const { count, error } = await db.from("tarik_requests").select("id", { count: "exact", head: true })
      .eq("profile_id", profileId).gte("dibuat", sinceIso);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  async expireTarik(nowIso) {
    must(await db.from("tarik_requests").update({ status: "kedaluwarsa" }).eq("status", "menunggu_tof").lt("kedaluwarsa_pada", nowIso));
  },
  async txidTarikSudahAda(txid, exceptId) {
    const { count, error } = await db.from("tarik_requests").select("id", { count: "exact", head: true }).eq("tof_txid", txid).neq("id", exceptId);
    if (error) throw new Error(error.message);
    return (count ?? 0) > 0;
  },

  // ---------------- Penampungan & batch ----------------
  async listDitampung() {
    return must(await db.from("topup_requests").select("*").eq("status", "ditampung").order("dibuat", { ascending: true }).limit(2000)) as TopupRow[];
  },
  async getBatchTerbuka() {
    return must(await db.from("topup_batch").select("*").in("status", ["disiapkan", "siap_dibagikan"]).limit(1).maybeSingle()) as BatchRow | null;
  },
  async getBatch(id) {
    return must(await db.from("topup_batch").select("*").eq("id", id).maybeSingle()) as BatchRow | null;
  },
  async insertBatch(row) {
    const { data, error } = await db.from("topup_batch").insert(row).select().single();
    if (!error) return { result: "ok", row: data as BatchRow };
    if (error.code === "23505") return { result: "duplicate" }; // sudah ada batch terbuka
    console.error("insertBatch:", error.message);
    return { result: "error" };
  },
  async updateBatchIf(id, expect, patch) {
    return must(await db.from("topup_batch").update(patch).eq("id", id).in("status", expect).select().maybeSingle()) as BatchRow | null;
  },
  async assignBatch(ids, batchId) {
    if (ids.length === 0) return [];
    // hanya baris yang masih 'ditampung' dan belum punya batch (cegah satu setoran masuk dua batch)
    return must(await db.from("topup_requests").update({ batch_id: batchId }).in("id", ids)
      .eq("status", "ditampung").is("batch_id", null).select()) as TopupRow[];
  },
  async releaseBatch(batchId) {
    must(await db.from("topup_requests").update({ batch_id: null }).eq("batch_id", batchId).eq("status", "ditampung"));
  },
  async listTopupByBatch(batchId) {
    return must(await db.from("topup_requests").select("*").eq("batch_id", batchId).order("dibuat", { ascending: true }).limit(2000)) as TopupRow[];
  },
  async sumTofAutoSince(sinceIso) {
    const rows = must(await db.from("topup_requests").select("tof_units")
      .in("status", ["mengirim", "selesai"]).gte("auto_kirim_pada", sinceIso)) as { tof_units: number }[];
    return (rows || []).reduce((n, r) => n + Number(r.tof_units), 0);
  },
  async logTopup(requestId, profileId, aksi, oleh, detail) {
    await db.from("topup_log").insert({ request_id: requestId, profile_id: profileId, aksi, oleh, detail }); // best effort
  },
};

// ---------------- Dompet pembayar (pengiriman TOF otomatis) ----------------
// Kunci hanya ada di secret PAYOUT_MNEMONIC (tidak pernah disimpan di database dan tidak dikirim ke browser).
let payout: { addr: string; sk: Uint8Array } | null = null;
try {
  if (PAYOUT_MNEMONIC) {
    const a = algosdk.mnemonicToSecretKey(PAYOUT_MNEMONIC);
    payout = { addr: String(a.addr), sk: a.sk };
  }
} catch (e) {
  console.error("PAYOUT_MNEMONIC tidak valid:", e);
}

async function algodGet(path: string) {
  const r = await fetch(ALGOD + path);
  if (!r.ok) throw Object.assign(new Error("algod " + r.status), { status: r.status });
  return await r.json();
}

const chain: Chain = {
  payoutAddress: () => (payout ? payout.addr : null),
  async getAccount(addr) {
    const j = await algodGet("/v2/accounts/" + addr);
    const aset = (j.assets || []).find((x: Record<string, unknown>) => Number(x["asset-id"]) === TOF_ASSET_ID);
    return { algo: BigInt(j.amount || 0), minBal: BigInt(j["min-balance"] || 0), tof: aset ? BigInt(aset.amount || 0) : 0n, tofOptin: !!aset };
  },
  async sendTof({ to, amount, note, leaseKey }) {
    if (!payout) throw { kind: "ditolak", message: "dompet pembayar belum diatur" };
    let blob: Uint8Array, txId: string;
    try {
      const p = await algodGet("/v2/transactions/params");
      const lease = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("topup:" + leaseKey)));
      const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: payout.addr, to, amount, assetIndex: TOF_ASSET_ID, note: new TextEncoder().encode(note),
        suggestedParams: { flatFee: true, fee: 1000, firstRound: p["last-round"], lastRound: p["last-round"] + 1000, genesisID: p["genesis-id"], genesisHash: p["genesis-hash"] },
      });
      // Lease: jaringan menolak transaksi kedua dengan pengirim+lease yang sama selama masa berlaku,
      // jadi percobaan ulang untuk tagihan yang sama tidak bisa terkirim dua kali.
      // (Helper make...FromObject mengabaikan opsi lease, jadi dipasang lewat addLease.)
      txn.addLease(lease);
      blob = txn.signTxn(payout.sk);
      txId = txn.txID();
    } catch (e) {
      throw { kind: "ditolak", message: "gagal menyiapkan transaksi: " + (e instanceof Error ? e.message : String(e)) }; // belum dikirim
    }
    let res: Response;
    try {
      res = await fetch(ALGOD + "/v2/transactions", { method: "POST", headers: { "Content-Type": "application/x-binary" }, body: blob });
    } catch (e) {
      throw { kind: "ambigu", message: "jaringan putus saat mengirim" }; // mungkin sudah diterima node
    }
    if (res.ok) return { txId };
    const teks = await res.text().catch(() => "");
    throw { kind: res.status >= 400 && res.status < 500 ? "ditolak" : "ambigu", message: teks || "HTTP " + res.status };
  },
  // Rincian transfer TOF terkonfirmasi lewat indexer (untuk verifikasi penarikan)
  async getTransfer(txId) {
    let r: Response;
    try { r = await fetch(INDEXER + "/v2/transactions/" + txId); } catch { return { status: "pending" }; }
    if (r.status === 404) return { status: "not_found" };
    if (!r.ok) return { status: "pending" };
    const j = await r.json();
    const tx = j.transaction;
    if (!tx || !(tx["confirmed-round"] > 0)) return { status: "pending" };
    const ax = tx["asset-transfer-transaction"];
    if (tx["tx-type"] !== "axfer" || !ax) return { status: "confirmed", isTof: false };
    return {
      status: "confirmed", sender: tx.sender, receiver: ax.receiver,
      isTof: Number(ax["asset-id"]) === TOF_ASSET_ID, amount: BigInt(ax.amount || 0),
    };
  },
  async status(txId) {
    try {
      const j = await algodGet("/v2/transactions/pending/" + txId);
      if (j["pool-error"]) return "rejected";
      return j["confirmed-round"] > 0 ? "confirmed" : "pending";
    } catch (e) {
      return (e as { status?: number })?.status === 404 ? "unknown" : "pending";
    }
  },
};

const deps: Deps = {
  repo,
  masterKey: MASTER_KEY,
  pepper: PEPPER,
  addressFromMnemonic: (m) => String(algosdk.mnemonicToSecretKey(m).addr),
  isValidAddress: (a) => algosdk.isValidAddress(a),
  now: () => Date.now(),
  adminIds: ADMIN_IDS,
  chain,
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
