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
  updateProfileFields(id: string, patch: Row): Promise<"ok" | "duplicate" | "error">; // username/nama/bio/tanggal lahir
  getSesiKunci(): Promise<string | null>; // kunci tanda tangan sesi (tabel tertutup tof_secret)
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
  // ---- Pinjam ke diri sendiri ----
  insertPinjaman(row: Record<string, unknown>): Promise<{ result: "ok" | "duplicate" | "error"; row?: PinjamanRow }>;
  getPinjaman(id: string): Promise<PinjamanRow | null>;
  // compare-and-set pada status (dan opsional bunga_status)
  updatePinjamanIf(id: string, expect: string[], patch: Record<string, unknown>, bungaExpect?: string[]): Promise<PinjamanRow | null>;
  listPinjamanByProfile(profileId: string, limit: number): Promise<PinjamanRow[]>;   // terbaru dulu
  listPinjamanBerjalan(profileId: string): Promise<PinjamanRow[]>;                    // status diajukan/aktif/dibayar
  listPinjamanByStatus(statuses: string[], limit: number, urut: "dibuat_asc" | "dibuat_desc" | "tempo_asc"): Promise<PinjamanRow[]>;
  sumBungaPinjamanSince(sinceIso: string): Promise<number>; // unit TOF bunga yang dikirim otomatis sejak waktu tsb
  // ---- Dividen ----
  insertDividenPeriode(row: Record<string, unknown>): Promise<{ result: "ok" | "duplicate" | "error"; row?: DividenPeriodeRow }>;
  getDividenPeriode(id: string): Promise<DividenPeriodeRow | null>;
  updateDividenPeriodeIf(id: string, expect: string[], patch: Record<string, unknown>): Promise<DividenPeriodeRow | null>;
  getDividenTerbuka(): Promise<DividenPeriodeRow | null>;            // status pratinjau / disetujui / berjalan
  listDividenPeriode(limit: number): Promise<DividenPeriodeRow[]>;   // terbaru dulu
  insertDividenItems(rows: Record<string, unknown>[]): Promise<void>;
  listDividenItem(periodeId: string): Promise<DividenItemRow[]>;
  getDividenItem(id: string): Promise<DividenItemRow | null>;
  updateDividenItemIf(id: string, expect: string[], patch: Record<string, unknown>): Promise<DividenItemRow | null>;
  getPersetujuan(profileId: string): Promise<PersetujuanRow | null>;
  upsertPersetujuan(row: PersetujuanRow): Promise<void>;
  deletePersetujuan(profileId: string): Promise<void>;
  listPersetujuan(): Promise<PersetujuanRow[]>;
  listVaultIds(): Promise<string[]>;
  listKandidatProfil(): Promise<Profile[]>;                           // id, username, pin_hash
  // ---- Tugas ----
  listTugasDefinisi(): Promise<TugasDefRow[]>;
  getTugasByKode(kode: string): Promise<TugasDefRow | null>;
  insertTugasDefinisi(row: Record<string, unknown>): Promise<{ result: "ok" | "duplicate" | "error"; row?: TugasDefRow }>;
  updateTugasDefinisi(id: string, patch: Record<string, unknown>): Promise<TugasDefRow | null>;
  catatTugasHari(profileId: string, kode: string, periode: string, hari: string): Promise<void>;   // +1, paling banyak sekali per hari WIB
  setTugasCatatan(profileId: string, kode: string, periode: string, jumlah: number, oleh: string | null): Promise<void>;
  tambahTugasCatatan(profileId: string, kode: string, periode: string, oleh: string | null): Promise<void>; // +1 tanpa batas harian (kehadiran)
  listTugasCatatan(dari: string, sampai: string | null, profileId: string | null): Promise<TugasCatatanRow[]>; // periode dari..sampai (null = seterusnya) + '-'
  // Menghitung baris per pengguna dari tabel yang ada di AKSI_TABEL; null bila kueri gagal (kolom/tabel belum ada)
  hitungAksi(tabel: string, kolomUser: string, kolomWaktu: string, sinceIso: string, untilIso: string | null, profileId: string | null): Promise<Record<string, number> | null>;
  insertTugasKlaim(row: Record<string, unknown>): Promise<{ result: "ok" | "error"; row?: TugasKlaimRow }>;
  getTugasKlaim(id: string): Promise<TugasKlaimRow | null>;
  updateTugasKlaimIf(id: string, expect: string[], patch: Record<string, unknown>): Promise<TugasKlaimRow | null>;
  listTugasKlaim(status: string, limit: number): Promise<TugasKlaimRow[]>;
  listTugasKlaimByProfile(profileId: string, limit: number): Promise<TugasKlaimRow[]>;
  insertKegiatan(row: Record<string, unknown>): Promise<{ result: "ok" | "duplicate" | "error"; row?: TugasKegiatanRow }>;
  getKegiatan(id: string): Promise<TugasKegiatanRow | null>;
  getKegiatanByKode(kodeHadir: string): Promise<TugasKegiatanRow | null>;
  updateKegiatan(id: string, patch: Record<string, unknown>): Promise<void>;
  listKegiatan(limit: number): Promise<TugasKegiatanRow[]>;
  insertKehadiran(kegiatanId: string, profileId: string): Promise<"ok" | "duplicate" | "error">;
  getKontak(profileId: string): Promise<KontakRow | null>;
  upsertKontak(profileId: string, patch: Record<string, unknown>): Promise<void>;
  listKontak(): Promise<KontakRow[]>;
  listDividenItemStatus(status: string): Promise<DividenItemRow[]>;
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
  // Potongan dividen: menandatangani dengan frasa anggota (dibuka dari brankas) dan mengirim TOF ke `to`; biaya ditanggung dompet pembayar.
  sendTofDariAnggota(a: { mnemonic: string; to: string; amount: bigint; note: string; leaseKey: string }): Promise<{ txId: string }>;
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

// Tanggal lahir disimpan sebagai teks "DD-MM-YYYY" (format yang dibaca Kaji Wayang). Terima juga D/M/YYYY lama.
function normTanggal(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(v.trim());
  if (!m) return null;
  return m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0") + "-" + m[3];
}

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

// HMAC-SHA256 (hex). Kunci diperlakukan sebagai teks UTF-8, sama dengan hmac(text, text, 'sha256') di pgcrypto.
export async function hmacHex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

// ---- Sesi bertanda tangan (login sekali, dipakai semua halaman) ----
// Token "v1.<exp>.<hmac>" menggantikan hash PIN pada parameter p_pin_hash di fungsi RPC database
// (tof_check_pin memeriksanya). Tanda tangan = HMAC-SHA256(kunci, id.exp.salt-PIN):
//   - tidak bisa dipalsukan tanpa kunci (tabel tertutup tof_secret),
//   - otomatis tidak berlaku bila PIN diganti/direset (salt berubah / baris PIN hilang).
// Bila kunci belum ada (SQL 009 belum dijalankan) sesi tidak dibuat; login tetap berhasil.
export const SESI_HARI = 30;

async function buatSesi(profileId: string, d: Deps): Promise<{ token: string; exp: number } | null> {
  try {
    const kunci = await d.repo.getSesiKunci();
    if (!kunci) return null;
    const row = await d.repo.getPin(profileId); // baca ulang: salt bisa berubah setelah PIN dinaikkan ke PBKDF2
    if (!row) return null;
    const exp = Math.floor(d.now() / 1000) + SESI_HARI * 86400;
    const sig = await hmacHex(kunci, `${profileId}.${exp}.${row.salt ?? ""}`);
    return { token: `v1.${exp}.${sig}`, exp };
  } catch (e) {
    console.error("buatSesi:", e);
    return null;
  }
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
      // username ATAU profile_id (alamat wallet, mis. dari Kartu QR) + PIN; batas salah PIN tetap berlaku
      const r = await resolveProfile(body, d, true);
      if ("error" in r) return fail(r.error);
      const v = await verifyPinFor(r.profile, body.pin, d);
      if (!v.ok) return v;
      const sesi = await buatSesi(r.profile.id, d);
      return ok({ profile: safeProfile(r.profile), ...(sesi ? { session: sesi } : {}) });
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
      const sesi = await buatSesi(p.id, d);
      return ok({ profile: safeProfile(p), ...(sesi ? { session: sesi } : {}) });
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
      const sesi = await buatSesi(address, d);
      return ok({ profile: created ? safeProfile(created) : { id: address, username }, ...(sesi ? { session: sesi } : {}) });
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
      // sesi lama otomatis tidak berlaku (salt PIN berubah): kirim sesi baru agar pengguna tidak perlu login ulang
      const sesi = await buatSesi(r.profile.id, d);
      return ok(sesi ? { session: sesi } : {});
    }

    // ---- Ubah data profil (username, nama lengkap, bio, tanggal lahir) ----
    // PIN wajib (login hanya localStorage, jadi PIN-lah bukti pemilik akun). Aturan sama dengan deposit/reveal:
    // akun yang PIN-nya masih terbaca publik harus ganti PIN dulu.
    case "update_profil": {
      const r = await resolveProfile(body, d, true);
      if ("error" in r) return fail(r.error);
      if (pinPublikAktif(r.profile, await d.repo.getPin(r.profile.id))) return fail("pin_publik");
      const v = await verifyPinFor(r.profile, body.pin, d);
      if (!v.ok) return v;
      if (await samaDenganHashPublik(r.profile, body.pin)) return fail("pin_publik");

      const patch: Row = {};

      if (typeof body.username === "string" && body.username.trim() !== r.profile.username) {
        const u = body.username.trim();
        if (!isValidUsername(u)) return fail("bad_username");
        const dupe = (await d.repo.findProfilesByUsername(u)).filter((x) => x.id !== r.profile.id);
        if (dupe.length > 0) return fail("username_taken");
        patch.username = u;
      }

      if (body.real_name !== undefined) {
        if (body.real_name !== null && typeof body.real_name !== "string") return fail("bad_real_name");
        const n = typeof body.real_name === "string" ? body.real_name.trim() : "";
        if (n.length > 60) return fail("bad_real_name");
        patch.real_name = n || null;
      }

      if (body.bio !== undefined) {
        if (body.bio !== null && typeof body.bio !== "string") return fail("bad_bio");
        const b = typeof body.bio === "string" ? body.bio.trim() : "";
        if (b.length > 300) return fail("bad_bio");
        patch.bio = b || null;
      }

      if (body.tanggal_lahir !== undefined) {
        const t = typeof body.tanggal_lahir === "string" ? body.tanggal_lahir.trim() : "";
        if (t) {
          const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(t);
          const ms = m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : NaN;
          const dt = new Date(ms);
          if (!m || isNaN(ms) || dt.getUTCDate() !== +m[1] || dt.getUTCMonth() !== +m[2] - 1 || ms > d.now() || +m[3] < 1900) {
            return fail("bad_tanggal_lahir");
          }
        }
        if ((t || null) !== normTanggal(r.profile.tanggal_lahir)) {
          patch.tanggal_lahir = t || null;
          // Hasil Kaji Wayang dihitung dari tanggal lahir, jadi dikosongkan agar dihitung ulang
          patch.wayang_archetype = null;
          patch.wuku_data = null;
        }
      }

      // Kontak (email, nomor HP) disimpan di tabel tertutup profil_kontak, BUKAN di profiles yang terbaca publik
      let kontakPatch: Row | null = null;
      if (body.email !== undefined || body.no_hp !== undefined) {
        kontakPatch = {};
        if (body.email !== undefined) {
          const e = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
          if (e && (e.length > 100 || !/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e))) return fail("bad_email");
          kontakPatch.email = e || null;
        }
        if (body.no_hp !== undefined) {
          const h = typeof body.no_hp === "string" ? body.no_hp.trim() : "";
          const n = h ? normalisasiHp(h) : null;
          if (h && !n) return fail("bad_no_hp");
          kontakPatch.no_hp = n;
        }
      }
      if (Object.keys(patch).length === 0) {
        if (kontakPatch) { await d.repo.upsertKontak(r.profile.id, kontakPatch); await d.repo.log(r.profile.id, "update_profil", true); }
        return ok({ profile: safeProfile(r.profile) });
      }

      const hasil = await d.repo.updateProfileFields(r.profile.id, patch);
      if (hasil === "duplicate") return fail("username_taken");
      if (hasil !== "ok") return fail("server_error");

      await d.repo.log(r.profile.id, "update_profil", true);
      if (kontakPatch) await d.repo.upsertKontak(r.profile.id, kontakPatch);
      const baru = await d.repo.findProfileById(r.profile.id);
      return ok({ profile: safeProfile(baru ?? { ...r.profile, ...patch }) });
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
    // Pinjam ke diri sendiri (nonaktif sampai pengurus menyalakannya)
    pinjam_aktif: s.pinjam_aktif === true,
    pinjam_min_rp: angka(s.pinjam_min_rp, 10000),
    pinjam_maks_rp: angka(s.pinjam_maks_rp, 5000000),
    pinjam_bunga_persen: angka(s.pinjam_bunga_persen, 5),
    // Dividen: batas minus per periode (persen, dipakai sebagai batas persetujuan anggota) dan saldo minimum peserta
    dividen_batas_minus_bp: angka(s.dividen_batas_minus_persen, 10) * 100,
    dividen_min_saldo_tof: angka(s.dividen_min_saldo_tof, 1),
    tugas_masa_tahan_bulan: angka(s.tugas_masa_tahan_bulan, 3), // dividen ditahan dihanguskan setelah masa ini
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
          tarik_aktif: s.tarik_aktif, alamat_tarik: s.alamat_tarik, min_tarik_tof: s.min_tarik_tof, maks_tarik_tof: s.maks_tarik_tof,
          pinjam_aktif: s.pinjam_aktif, pinjam_min_rp: s.pinjam_min_rp, pinjam_maks_rp: s.pinjam_maks_rp,
          dividen_batas_minus_persen: s.dividen_batas_minus_bp / 100, dividen_min_saldo_tof: s.dividen_min_saldo_tof },
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
      if ("pinjam_min_rp" in body) { const n = bil(body.pinjam_min_rp, 100000000); if (n === null) return fail("batas_pinjam_tidak_valid"); nilai.pinjam_min_rp = n; }
      if ("pinjam_maks_rp" in body) { const n = bil(body.pinjam_maks_rp, 1000000000); if (n === null) return fail("batas_pinjam_tidak_valid"); nilai.pinjam_maks_rp = n; }
      if (((nilai.pinjam_maks_rp as number | undefined) ?? cur.pinjam_maks_rp) < ((nilai.pinjam_min_rp as number | undefined) ?? cur.pinjam_min_rp)) return fail("batas_pinjam_tidak_valid");
      if ("pinjam_aktif" in body) nilai.pinjam_aktif = body.pinjam_aktif === true;
      if ("dividen_batas_minus_persen" in body) { const n = bil(body.dividen_batas_minus_persen, 50); if (n === null) return fail("batas_dividen_tidak_valid"); nilai.dividen_batas_minus_persen = n; }
      if ("dividen_min_saldo_tof" in body) { const n = bil(body.dividen_min_saldo_tof, 1000000000); if (n === null) return fail("batas_dividen_tidak_valid"); nilai.dividen_min_saldo_tof = n; }
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
      {
        const kunci = await jaminanTerkunci(a.profile.id, d); // TOF yang sedang menjadi jaminan pinjaman
        if (kunci > 0n && saldo.tof - kunci < BigInt(units)) return fail("jaminan_terkunci", { bebas_units: Number(saldo.tof > kunci ? saldo.tof - kunci : 0n) });
      }
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
      return await handlePinjam(action, body, d);
  }
}

// ============================================================
// PINJAM KE DIRI SENDIRI — pinjam uang (rupiah) dari kas dengan jaminan TOF milik sendiri
//  - Batas pinjam = nilai TOF on-chain yang tidak sedang terkunci (dibaca SERVER dari algod), dibatasi pinjam_maks_rp.
//  - Bunga flat (bawaan 5%) dari pokok. Bunga dibayar rupiah bersama pokok; setelah lunas, bunga dikirim balik
//    ke dompet anggota sebagai TOF (dompet pembayar, batas harian yang sama dengan Nabung).
//  - Jaminan = kunci lunak: dihitung di server dan dipakai menolak tarik_buat dan pinjaman baru.
//    TOF tetap berada di dompet anggota (anggota yang memegang kuncinya), jadi ini alat komitmen diri, bukan pengaman kas.
//  - Satu pinjaman berjalan per anggota (indeks unik di database).
// ============================================================
export interface PinjamanRow {
  id: string; profile_id: string; username: string | null;
  pokok_rp: number; bunga_persen: number; bunga_rp: number; total_rp: number;
  kurs_rp_per_tof: number; jaminan_tof_units: number; bunga_tof_units: number; tenor_hari: number;
  tujuan_jenis: string; tujuan_nomor: string; tujuan_nama: string; status: string;
  dibuat: string; dicairkan_pada: string | null; dicairkan_oleh: string | null; jatuh_tempo: string | null;
  ditagih_admin: boolean; ditagih_pada: string | null; kode_unik: number | null; total_bayar_rp: number | null;
  ref_cair: string | null; ref_user: string | null; catatan_admin: string | null;
  dibayar_pada: string | null; dilunasi_pada: string | null; dilunasi_oleh: string | null;
  bunga_status: string; bunga_catatan: string | null; bunga_txid: string | null; bunga_kirim_pada: string | null;
}

const PINJAM_TENOR_OPSI = [7, 14, 30];
const PINJAM_BERJALAN = ["diajukan", "aktif", "dibayar"];
const HARI_MS = 24 * 3600 * 1000;

function tampilPinjam(r: PinjamanRow) {
  return {
    id: r.id, profile_id: r.profile_id, username: r.username, pokok_rp: r.pokok_rp, bunga_persen: r.bunga_persen, bunga_rp: r.bunga_rp,
    total_rp: r.total_rp, jaminan_tof_units: r.jaminan_tof_units, bunga_tof_units: r.bunga_tof_units, tenor_hari: r.tenor_hari,
    tujuan_jenis: r.tujuan_jenis, tujuan_nomor: r.tujuan_nomor, tujuan_nama: r.tujuan_nama, status: r.status, dibuat: r.dibuat,
    jatuh_tempo: r.jatuh_tempo, ditagih_admin: r.ditagih_admin, ditagih_pada: r.ditagih_pada, kode_unik: r.kode_unik,
    total_bayar_rp: r.total_bayar_rp, ref_cair: r.ref_cair, ref_user: r.ref_user, catatan_admin: r.catatan_admin,
    bunga_status: r.bunga_status, bunga_catatan: r.bunga_catatan, bunga_txid: r.bunga_txid,
  };
}

// Total TOF (unit terkecil) yang sedang menjadi jaminan pinjaman berjalan
async function jaminanTerkunci(profileId: string, d: Deps): Promise<bigint> {
  const rows = await d.repo.listPinjamanBerjalan(profileId);
  return rows.reduce((n, r) => n + BigInt(r.jaminan_tof_units), 0n);
}

function catatanBunga(username: string, address: string): string {
  return (username || "-") + " # " + address + " # bunga pinjaman";
}

// Mengirim bunga (TOF) ke dompet anggota setelah pinjaman lunas. Pengamannya sama dengan Nabung:
// klaim atomik (bunga_status 'mengirim'), lease Algorand dari ID pinjaman, batas per transaksi dan harian, pra-cek opt-in dan saldo.
async function kirimBungaPinjam(row: PinjamanRow, oleh: string, d: Deps): Promise<Payout> {
  const chain = d.chain;
  const s = await ambilPengaturan(d);
  const tunda = async (alasan: string): Promise<Payout> => {
    await d.repo.updatePinjamanIf(row.id, ["lunas"], { bunga_catatan: alasan }, ["belum"]);
    return { status: "tertunda", alasan };
  };
  const kembali = async (alasan: string) => {
    await d.repo.updatePinjamanIf(row.id, ["lunas"], { bunga_status: "belum", bunga_catatan: alasan, bunga_txid: null }, ["mengirim"]);
  };
  const units = BigInt(row.bunga_tof_units);
  if (units <= 0n) {
    await d.repo.updatePinjamanIf(row.id, ["lunas"], { bunga_status: "terkirim", bunga_catatan: "Bunga kurang dari 1 unit TOF, tidak ada yang dikirim." }, ["belum"]);
    return { status: "selesai" };
  }
  if (!s.auto_kirim) return tunda("Kirim otomatis nonaktif. Kirim bunga manual dari Dompet.");
  if (!chain || !chain.payoutAddress()) return tunda("Dompet pembayar belum diatur (secret PAYOUT_MNEMONIC).");
  if (units > BigInt(s.batas_transaksi_tof) * 1000000n) return tunda("Melebihi batas per transaksi kirim otomatis. Kirim manual.");
  const since = iso(d.now() - 24 * 3600 * 1000);
  const terpakai = BigInt(await d.repo.sumTofAutoSince(since)) + BigInt(await d.repo.sumBungaPinjamanSince(since));
  if (terpakai + units > BigInt(s.batas_harian_tof) * 1000000n) return tunda("Melebihi batas harian kirim otomatis. Kirim manual atau tunggu.");

  const klaim = await d.repo.updatePinjamanIf(row.id, ["lunas"], { bunga_status: "mengirim", bunga_catatan: null, bunga_kirim_pada: iso(d.now()) }, ["belum"]);
  if (!klaim) return { status: "tertunda", alasan: "Bunga sudah dikirim atau sedang diproses." };

  try {
    const [kas, tujuan] = await Promise.all([chain.getAccount(chain.payoutAddress()!), chain.getAccount(row.profile_id)]);
    const gagal = !tujuan.tofOptin ? "Penerima belum opt-in TOF. Minta anggota opt-in, lalu kirim ulang."
      : kas.tof < units ? "Saldo TOF dompet pembayar kurang. Isi ulang dompet pembayar."
      : kas.algo - kas.minBal < FEE_UNITS ? "Saldo ALGO dompet pembayar kurang untuk biaya. Isi ulang dompet pembayar."
      : "";
    if (gagal) { await kembali(gagal); return { status: "tertunda", alasan: gagal }; }
  } catch (e) {
    console.error("pra-cek bunga pinjaman:", e);
    await kembali("Gagal membaca jaringan Algorand. Coba kirim ulang.");
    return { status: "tertunda", alasan: "Gagal membaca jaringan Algorand. Coba kirim ulang." };
  }

  let txId = "";
  try {
    ({ txId } = await chain!.sendTof({ to: row.profile_id, amount: units, note: catatanBunga(row.username || "", row.profile_id), leaseKey: "pinjam-bunga:" + row.id }));
  } catch (e) {
    const kind = (e as { kind?: string })?.kind;
    const pesan = String((e as { message?: string })?.message || "").slice(0, 150);
    await d.repo.logTopup(row.id, row.profile_id, "pinjam_bunga_gagal", oleh, { kind, pesan });
    if (kind === "ditolak") { await kembali("Ditolak jaringan: " + pesan); return { status: "tertunda", alasan: "Ditolak jaringan: " + pesan }; }
    const cat = "Hasil pengiriman bunga tidak pasti. Periksa dompet pembayar di explorer sebelum mengirim ulang.";
    await d.repo.updatePinjamanIf(row.id, ["lunas"], { bunga_catatan: cat }, ["mengirim"]);
    return { status: "mengirim", alasan: cat };
  }

  await d.repo.updatePinjamanIf(row.id, ["lunas"], { bunga_txid: txId }, ["mengirim"]);
  await d.repo.logTopup(row.id, row.profile_id, "pinjam_bunga_kirim", oleh, { txid: txId, tof_units: row.bunga_tof_units });
  const hasil = await tungguKonfirmasi(txId, d);
  if (hasil === "confirmed") {
    await d.repo.updatePinjamanIf(row.id, ["lunas"], { bunga_status: "terkirim" }, ["mengirim"]);
    return { status: "selesai", txid: txId };
  }
  if (hasil === "rejected") { await kembali("Transaksi ditolak jaringan setelah dikirim. Coba kirim ulang."); return { status: "tertunda", alasan: "Transaksi ditolak jaringan setelah dikirim." }; }
  return { status: "mengirim", txid: txId, alasan: "Menunggu konfirmasi jaringan. Tekan Kirim bunga lagi beberapa saat lagi untuk memeriksa." };
}

async function handlePinjam(action: unknown, body: Row, d: Deps): Promise<Res> {
  switch (action) {
    // ---- publik: info untuk menampilkan kartu Pinjam ----
    case "pinjam_info": {
      const s = await ambilPengaturan(d);
      return ok({
        aktif: s.pinjam_aktif && !!s.qris, bunga_persen: s.pinjam_bunga_persen, tenor_opsi: PINJAM_TENOR_OPSI,
        min_rp: s.pinjam_min_rp, maks_rp: s.pinjam_maks_rp, kurs: s.kurs, qris: s.qris, nama_penerima: s.nama_penerima,
      });
    }

    // ---- tanpa PIN: jaminan terkunci + tagihan jatuh tempo (tanpa data rekening tujuan) ----
    case "pinjam_tagihan": {
      const r = await resolveProfile(body, d, true);
      if ("error" in r) return fail(r.error);
      const rows = await d.repo.listPinjamanBerjalan(r.profile.id);
      const terkunci = rows.reduce((n, x) => n + BigInt(x.jaminan_tof_units), 0n);
      const sekarang = d.now();
      const p = rows.find((x) => x.status === "aktif" && !!x.jatuh_tempo && (Date.parse(x.jatuh_tempo) <= sekarang || x.ditagih_admin));
      let tagihan: Res | null = null;
      if (p && p.jatuh_tempo) {
        const jt = Date.parse(p.jatuh_tempo);
        tagihan = {
          id: p.id, pokok_rp: p.pokok_rp, bunga_rp: p.bunga_rp, total_rp: p.total_rp, jatuh_tempo: p.jatuh_tempo,
          terlambat_hari: Math.max(0, Math.floor((sekarang - jt) / HARI_MS)), sisa_hari: Math.ceil((jt - sekarang) / HARI_MS),
          ditagih_pengurus: p.ditagih_admin,
        };
      }
      return ok({ terkunci_units: Number(terkunci), tagihan });
    }

    case "pinjam_buat": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      // Pinjaman mencairkan uang tanpa tanda tangan dompet, jadi PIN yang hash-nya masih terbaca publik tidak boleh dipakai.
      if (pinPublikAktif(a.profile, await d.repo.getPin(a.profile.id))) return fail("pin_publik");
      if (await samaDenganHashPublik(a.profile, body.pin)) return fail("pin_publik");
      const s = await ambilPengaturan(d);
      if (!(s.pinjam_aktif && s.qris)) return fail("pinjam_nonaktif");
      const pokok = Number(body.pokok_rp);
      if (!Number.isInteger(pokok) || pokok < s.pinjam_min_rp) return fail("pinjam_min_rp", { min_rp: s.pinjam_min_rp });
      const tenor = Number(body.tenor_hari);
      if (!PINJAM_TENOR_OPSI.includes(tenor)) return fail("tenor_tidak_valid");
      const tujuan = cekTujuanTarik(body);
      if ("error" in tujuan) return fail(tujuan.error);
      const sekarang = d.now();
      const riwayat = await d.repo.listPinjamanByProfile(a.profile.id, 50);
      if (riwayat.some((r) => PINJAM_BERJALAN.includes(r.status))) return fail("masih_ada_pinjaman");
      if (riwayat.filter((r) => Date.parse(r.dibuat) >= sekarang - 24 * 3600 * 1000).length >= 5) return fail("terlalu_sering");
      if (!d.chain) return fail("chain_tidak_tersedia");
      let saldo;
      try { saldo = await d.chain.getAccount(a.profile.id); } catch { return fail("gagal_baca_saldo"); }
      const kurs = BigInt(s.kurs);
      const bebas = saldo.tofOptin ? saldo.tof : 0n; // tidak ada pinjaman berjalan (sudah diperiksa), jadi tidak ada TOF terkunci
      let maks = Number((bebas * kurs) / 1000000n);
      if (maks > s.pinjam_maks_rp) maks = s.pinjam_maks_rp;
      if (pokok > maks) return fail("pinjam_melebihi_batas", { maks_rp: maks });
      const bungaRp = Math.floor((pokok * s.pinjam_bunga_persen) / 100);
      const jaminan = (BigInt(pokok) * 1000000n + kurs - 1n) / kurs; // dibulatkan ke atas
      const bungaTof = (BigInt(bungaRp) * 1000000n) / kurs;
      const ins = await d.repo.insertPinjaman({
        profile_id: a.profile.id, username: a.profile.username, pokok_rp: pokok, bunga_persen: s.pinjam_bunga_persen, bunga_rp: bungaRp,
        total_rp: pokok + bungaRp, kurs_rp_per_tof: s.kurs, jaminan_tof_units: Number(jaminan), bunga_tof_units: Number(bungaTof), tenor_hari: tenor,
        tujuan_jenis: tujuan.jenis, tujuan_nomor: tujuan.nomor, tujuan_nama: tujuan.nama, status: "diajukan", dibuat: iso(sekarang),
      });
      if (ins.result === "duplicate") return fail("masih_ada_pinjaman");
      if (ins.result !== "ok" || !ins.row) return fail("server_error");
      await d.repo.logTopup(ins.row.id, a.profile.id, "pinjam_buat", a.profile.id, { pokok_rp: pokok, bunga_rp: bungaRp, tenor_hari: tenor });
      return ok({ pinjam: tampilPinjam(ins.row) });
    }

    case "pinjam_saya": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      const daftar = (await d.repo.listPinjamanByProfile(a.profile.id, 20)).reverse(); // terlama → terbaru (client membaliknya)
      return ok({ daftar: daftar.map(tampilPinjam) });
    }

    case "pinjam_batal": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      const row = typeof body.id === "string" ? await d.repo.getPinjaman(body.id) : null;
      if (!row || row.profile_id !== a.profile.id) return fail("pinjam_tidak_ditemukan");
      const baru = await d.repo.updatePinjamanIf(row.id, ["diajukan"], { status: "dibatalkan" });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(row.id, a.profile.id, "pinjam_batal", a.profile.id, {});
      return ok({ pinjam: tampilPinjam(baru) });
    }

    // Anggota menekan "Lunasi": server memberi total bayar dengan kode unik (idempoten: kode yang sama dipakai ulang)
    case "pinjam_bayar": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      const row = typeof body.id === "string" ? await d.repo.getPinjaman(body.id) : null;
      if (!row || row.profile_id !== a.profile.id) return fail("pinjam_tidak_ditemukan");
      if (row.status !== "aktif" && row.status !== "dibayar") return fail("status_tidak_cocok");
      if (row.total_bayar_rp) return ok({ pinjam: tampilPinjam(row) });
      // hindari total yang sama dengan tagihan Nabung aktif atau pelunasan pinjaman lain (supaya mutasi tidak ambigu)
      const dipakai = new Set<number>();
      for (const t of await d.repo.listTopupByStatus(["menunggu", "dibayar"], 1000)) dipakai.add(Number(t.total_rp));
      for (const p of await d.repo.listPinjamanByStatus(["aktif", "dibayar"], 1000, "dibuat_asc")) if (p.total_bayar_rp) dipakai.add(Number(p.total_bayar_rp));
      for (const kode of acakKode()) {
        const total = row.total_rp + kode;
        if (dipakai.has(total)) continue;
        const baru = await d.repo.updatePinjamanIf(row.id, ["aktif"], { kode_unik: kode, total_bayar_rp: total });
        if (!baru) return fail("status_tidak_cocok");
        await d.repo.logTopup(row.id, a.profile.id, "pinjam_bayar", a.profile.id, { total_bayar_rp: total });
        return ok({ pinjam: tampilPinjam(baru) });
      }
      return fail("kode_unik_habis");
    }

    case "pinjam_dibayar": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      const row = typeof body.id === "string" ? await d.repo.getPinjaman(body.id) : null;
      if (!row || row.profile_id !== a.profile.id) return fail("pinjam_tidak_ditemukan");
      if (!row.total_bayar_rp) return fail("status_tidak_cocok");
      const baru = await d.repo.updatePinjamanIf(row.id, ["aktif"], { status: "dibayar", ref_user: teks(body.ref, 60) || null, dibayar_pada: iso(d.now()) });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(row.id, a.profile.id, "pinjam_dibayar", a.profile.id, { ref: baru.ref_user });
      return ok({ pinjam: tampilPinjam(baru) });
    }

    // ---------------- pengurus ----------------
    case "admin_pinjam_daftar": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const t = body.tampil;
      let rows: PinjamanRow[];
      if (t === "diajukan") rows = await d.repo.listPinjamanByStatus(["diajukan"], 100, "dibuat_asc");
      else if (t === "dibayar") rows = await d.repo.listPinjamanByStatus(["dibayar"], 100, "dibuat_asc");
      else if (t === "aktif") rows = await d.repo.listPinjamanByStatus(["aktif"], 100, "tempo_asc");
      else rows = (await d.repo.listPinjamanByStatus(["lunas", "ditolak", "dibatalkan"], 100, "dibuat_desc")).reverse();
      const nama = await namaProfil(d, rows.map((r) => r.profile_id));
      return ok({ daftar: rows.map((r) => ({ ...tampilPinjam(r), username: nama.get(r.profile_id) || r.username || "", bunga_tof_units: r.bunga_tof_units })) });
    }

    // Pengurus sudah mengirim uang pokok ke tujuan anggota → pinjaman mulai berjalan, jatuh tempo dihitung dari sekarang
    case "admin_pinjam_cairkan": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const ref = teks(body.ref, 100);
      if (!ref) return fail("ref_wajib");
      const row = typeof body.id === "string" ? await d.repo.getPinjaman(body.id) : null;
      if (!row) return fail("pinjam_tidak_ditemukan");
      if (row.profile_id === a.profile.id && (d.adminIds || []).length > 1) return fail("tidak_boleh_proses_sendiri");
      if (row.status !== "diajukan") return fail("status_tidak_cocok");
      // kunci lunak: pastikan TOF jaminan masih ada di dompet anggota saat uang dikirim
      if (!d.chain) return fail("chain_tidak_tersedia");
      try {
        const ac = await d.chain.getAccount(row.profile_id);
        if (!ac.tofOptin || ac.tof < BigInt(row.jaminan_tof_units)) return fail("jaminan_kurang", { jaminan_units: row.jaminan_tof_units, saldo_units: Number(ac.tof) });
      } catch { return fail("gagal_baca_saldo"); }
      const sekarang = d.now();
      const baru = await d.repo.updatePinjamanIf(row.id, ["diajukan"], {
        status: "aktif", dicairkan_pada: iso(sekarang), dicairkan_oleh: a.profile.id, ref_cair: ref,
        jatuh_tempo: iso(sekarang + row.tenor_hari * HARI_MS),
      });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(row.id, row.profile_id, "pinjam_cairkan", a.profile.id, { pokok_rp: row.pokok_rp, ref });
      return ok({ pinjam: tampilPinjam(baru) });
    }

    case "admin_pinjam_tolak": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const alasan = teks(body.alasan, 200);
      if (!alasan) return fail("alasan_wajib");
      const row = typeof body.id === "string" ? await d.repo.getPinjaman(body.id) : null;
      if (!row) return fail("pinjam_tidak_ditemukan");
      const baru = await d.repo.updatePinjamanIf(row.id, ["diajukan"], { status: "ditolak", catatan_admin: alasan });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(row.id, row.profile_id, "pinjam_tolak", a.profile.id, { alasan });
      return ok({ pinjam: tampilPinjam(baru) });
    }

    // Nyalakan/matikan tagihan pop-up lebih awal dari jatuh tempo
    case "admin_pinjam_tagih": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const row = typeof body.id === "string" ? await d.repo.getPinjaman(body.id) : null;
      if (!row) return fail("pinjam_tidak_ditemukan");
      const tagih = body.tagih !== false;
      const baru = await d.repo.updatePinjamanIf(row.id, ["aktif"], { ditagih_admin: tagih, ditagih_pada: tagih ? iso(d.now()) : null });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(row.id, row.profile_id, tagih ? "pinjam_tagih" : "pinjam_henti_tagih", a.profile.id, {});
      return ok({ pinjam: tampilPinjam(baru) });
    }

    // Anggota bilang sudah bayar tetapi mutasi belum ada → kembali ke 'aktif'
    case "admin_pinjam_belum_masuk": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const alasan = teks(body.alasan, 200);
      if (!alasan) return fail("alasan_wajib");
      const row = typeof body.id === "string" ? await d.repo.getPinjaman(body.id) : null;
      if (!row) return fail("pinjam_tidak_ditemukan");
      const baru = await d.repo.updatePinjamanIf(row.id, ["dibayar"], { status: "aktif", catatan_admin: alasan });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(row.id, row.profile_id, "pinjam_belum_masuk", a.profile.id, { alasan });
      return ok({ pinjam: tampilPinjam(baru) });
    }

    // Uang pelunasan sudah masuk kas → lunas, jaminan dibuka, bunga dikirim balik sebagai TOF
    case "admin_pinjam_lunas": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const row = typeof body.id === "string" ? await d.repo.getPinjaman(body.id) : null;
      if (!row) return fail("pinjam_tidak_ditemukan");
      if (row.profile_id === a.profile.id && (d.adminIds || []).length > 1) return fail("tidak_boleh_proses_sendiri");
      const baru = await d.repo.updatePinjamanIf(row.id, ["aktif", "dibayar"], { status: "lunas", dilunasi_pada: iso(d.now()), dilunasi_oleh: a.profile.id });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(row.id, row.profile_id, "pinjam_lunas", a.profile.id, { total_rp: row.total_rp });
      const payout = await kirimBungaPinjam(baru, a.profile.id, d);
      return ok({ pinjam: tampilPinjam((await d.repo.getPinjaman(row.id)) || baru), payout });
    }

    // Kirim ulang / periksa bunga TOF setelah lunas. yakin:true mengembalikan status 'mengirim' tanpa ID transaksi (setelah memeriksa explorer).
    case "admin_pinjam_kirim_bunga": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const row = typeof body.id === "string" ? await d.repo.getPinjaman(body.id) : null;
      if (!row) return fail("pinjam_tidak_ditemukan");
      if (row.status !== "lunas") return fail("status_tidak_cocok");
      if (row.bunga_status === "terkirim") return fail("bunga_sudah_terkirim");
      if (row.bunga_status === "mengirim") {
        if (!row.bunga_txid) {
          if (body.yakin !== true) return fail("konfirmasi_wajib");
          await d.repo.updatePinjamanIf(row.id, ["lunas"], { bunga_status: "belum", bunga_catatan: "Dikembalikan manual oleh pengurus untuk dikirim ulang." }, ["mengirim"]);
          await d.repo.logTopup(row.id, row.profile_id, "pinjam_bunga_reset", a.profile.id, {});
        } else {
          if (!d.chain) return fail("kas_belum_diatur");
          const st = await d.chain.status(row.bunga_txid);
          if (st === "confirmed") await d.repo.updatePinjamanIf(row.id, ["lunas"], { bunga_status: "terkirim" }, ["mengirim"]);
          else if (st === "rejected") await d.repo.updatePinjamanIf(row.id, ["lunas"], { bunga_status: "belum", bunga_txid: null, bunga_catatan: "Transaksi ditolak jaringan. Coba kirim ulang." }, ["mengirim"]);
          const terbaru = (await d.repo.getPinjaman(row.id)) || row;
          return ok({ pinjam: tampilPinjam(terbaru), payout: { status: st === "confirmed" ? "selesai" : st === "rejected" ? "tertunda" : "mengirim", txid: row.bunga_txid } });
        }
      }
      const segar = (await d.repo.getPinjaman(row.id)) || row;
      const payout = await kirimBungaPinjam(segar, a.profile.id, d);
      return ok({ pinjam: tampilPinjam((await d.repo.getPinjaman(row.id)) || segar), payout });
    }

    default:
      return await handleDividen(action, body, d);
  }
}

// ============================================================
// DIVIDEN — pembagian (positif) atau koreksi (negatif) berdasarkan persentase dari saldo TOF tiap peserta.
//  - Pengurus mengetik persentase → server membuat PRATINJAU (daftar peserta + jumlah) yang disimpan sebagai foto saldo.
//    Peserta bisa dicentang/dikeluarkan; yang tidak memenuhi syarat otomatis dilewati beserta alasannya.
//  - Syarat peserta: frasa dititip, sudah menyetujui (dividen_setuju), PIN sudah diamankan, sudah opt-in TOF, saldo >= minimum.
//  - Positif: TOF dikirim dari dompet pembayar. Negatif: TOF ditarik OTOMATIS dari dompet peserta (frasa dibuka dari brankas,
//    ditandatangani di server, biaya jaringan ditanggung dompet pembayar lewat transaksi berkelompok), dikirim ke dompet pembayar.
//  - Pagar negatif: batas persen per periode (pengaturan), persetujuan anggota memuat batasnya, TOF jaminan pinjaman diambil
//    paling akhir (hanya TOF bebas yang dipotong), butuh persetujuan pengurus kedua bila pengurus lebih dari satu.
//  - Satu periode terbuka pada satu waktu, satu label hanya sekali (indeks unik), tiap transaksi memakai lease dari ID item.
// ============================================================
export interface DividenPeriodeRow {
  id: string; label: string; persen_bp: number; status: string; dibuat: string; dibuat_oleh: string | null;
  disetujui_oleh: string | null; disetujui_pada: string | null; selesai_pada: string | null; catatan: string | null;
  bulan_tugas: string | null;
}
export interface DividenItemRow {
  id: string; periode_id: string; profile_id: string; username: string | null; saldo_units: number; terkunci_units: number;
  arah: string; jumlah_units: number; kurang_units: number; ikut: boolean; status: string; alasan: string | null;
  txid: string | null; kirim_pada: string | null; tugas_kurang: string | null; ditahan_pada: string | null;
}
export interface PersetujuanRow { profile_id: string; batas_minus_bp: number; versi: number; disetujui_pada: string }

const DIVIDEN_MAKS_PER_PANGGILAN = 5;
const VERSI_PERSETUJUAN = 1;

function catatanDividen(username: string, address: string, label: string): string {
  return (username || "-") + " # " + address + " # dividen " + label;
}

function tampilPeriodeDividen(p: DividenPeriodeRow) {
  return {
    id: p.id, label: p.label, persen_bp: p.persen_bp, status: p.status, dibuat: p.dibuat,
    dibuat_oleh: p.dibuat_oleh, disetujui_oleh: p.disetujui_oleh, disetujui_pada: p.disetujui_pada, selesai_pada: p.selesai_pada,
    bulan_tugas: p.bulan_tugas,
  };
}

function tampilItemDividen(i: DividenItemRow) {
  return {
    id: i.id, profile_id: i.profile_id, username: i.username || "", saldo_units: i.saldo_units, terkunci_units: i.terkunci_units,
    arah: i.arah, jumlah_units: i.jumlah_units, kurang_units: i.kurang_units, ikut: i.ikut, status: i.status,
    alasan: i.alasan, txid: i.txid, tugas_kurang: i.tugas_kurang, ditahan_pada: i.ditahan_pada,
  };
}

function ringkasDividen(items: DividenItemRow[]) {
  const aktif = items.filter((i) => i.ikut && !["dilewati", "ditahan", "hangus"].includes(i.status));
  const jml = (rs: DividenItemRow[]) => rs.reduce((n, r) => n + Number(r.jumlah_units), 0);
  const hitung = (st: string) => items.filter((i) => i.ikut && i.status === st).length;
  const ditahan = items.filter((i) => i.status === "ditahan");
  return {
    peserta: aktif.length, dilewati: items.filter((i) => i.status === "dilewati").length,
    total_bagi_units: jml(aktif.filter((i) => i.arah === "bagi")), total_potong_units: jml(aktif.filter((i) => i.arah === "potong")),
    menunggu: hitung("menunggu"), mengirim: hitung("mengirim"), selesai: hitung("selesai"), gagal: hitung("gagal"),
    ditahan: ditahan.length, total_ditahan_units: jml(ditahan), hangus: items.filter((i) => i.status === "hangus").length,
  };
}

async function tampilDividenLengkap(p: DividenPeriodeRow, d: Deps) {
  const items = await d.repo.listDividenItem(p.id);
  return { periode: tampilPeriodeDividen(p), ringkas: ringkasDividen(items), items: items.map(tampilItemDividen) };
}

// Menandatangani dan mengirim penarikan dari dompet peserta untuk satu item 'potong' atau pengiriman untuk item 'bagi'
async function prosesDividenItem(it: DividenItemRow, p: DividenPeriodeRow, oleh: string, d: Deps): Promise<void> {
  const chain = d.chain;
  const klaim = await d.repo.updateDividenItemIf(it.id, ["menunggu"], { status: "mengirim", kirim_pada: iso(d.now()), alasan: null });
  if (!klaim) return;
  const gagal = async (alasan: string) => {
    await d.repo.updateDividenItemIf(it.id, ["mengirim"], { status: "gagal", alasan });
    await d.repo.logTopup(it.id, it.profile_id, "dividen_gagal", oleh, { alasan, arah: it.arah });
  };
  if (!chain || !chain.payoutAddress()) return await gagal("Dompet pembayar belum diatur.");
  const kasAddr = chain.payoutAddress()!;
  const units = BigInt(it.jumlah_units);
  const catatan = catatanDividen(it.username || "", it.profile_id, p.label);
  let txId = "";

  try {
    if (it.arah === "bagi") {
      const [kas, tujuan] = await Promise.all([chain.getAccount(kasAddr), chain.getAccount(it.profile_id)]);
      if (!tujuan.tofOptin) return await gagal("Penerima belum opt-in TOF.");
      if (kas.tof < units) return await gagal("Saldo TOF dompet pembayar kurang.");
      if (kas.algo - kas.minBal < FEE_UNITS) return await gagal("Saldo ALGO dompet pembayar kurang untuk biaya.");
    } else {
      const [kas, anggota, kunci] = await Promise.all([chain.getAccount(kasAddr), chain.getAccount(it.profile_id), jaminanTerkunci(it.profile_id, d)]);
      if (!anggota.tofOptin || anggota.tof - kunci < units) return await gagal("Saldo TOF bebas peserta berubah dan kurang dari jumlah potongan. Ulangi setelah dicek.");
      if (kas.algo - kas.minBal < FEE_UNITS * 2n) return await gagal("Saldo ALGO dompet pembayar kurang untuk biaya (biaya potongan ditanggung dompet pembayar).");
    }
  } catch (e) {
    console.error("pra-cek dividen:", e);
    return await gagal("Gagal membaca jaringan Algorand. Ulangi.");
  }

  try {
    if (it.arah === "bagi") {
      ({ txId } = await chain.sendTof({ to: it.profile_id, amount: units, note: catatan, leaseKey: "dividen:" + it.id }));
    } else {
      const vault = await d.repo.getVault(it.profile_id);
      if (!vault) return await gagal("Frasa tidak ada di brankas.");
      let mnemonic = "";
      try { mnemonic = await decryptMnemonic(vault.ciphertext, vault.iv, d.masterKey, it.profile_id); }
      catch (e) { console.error("dekripsi dividen:", e); return await gagal("Gagal membuka brankas frasa."); }
      let alamat = "";
      try { alamat = d.addressFromMnemonic(mnemonic); } catch { return await gagal("Frasa di brankas tidak valid."); }
      if (alamat !== it.profile_id) return await gagal("Frasa di brankas tidak cocok dengan alamat dompet.");
      ({ txId } = await chain.sendTofDariAnggota({ mnemonic, to: kasAddr, amount: units, note: catatan, leaseKey: "dividen:" + it.id }));
    }
  } catch (e) {
    const kind = (e as { kind?: string })?.kind;
    const pesan = String((e as { message?: string })?.message || "").slice(0, 150);
    await d.repo.logTopup(it.id, it.profile_id, "dividen_kirim_gagal", oleh, { kind, pesan });
    if (kind === "ditolak") return await gagal("Ditolak jaringan: " + pesan);
    await d.repo.updateDividenItemIf(it.id, ["mengirim"], { alasan: "Hasil pengiriman tidak pasti. Periksa explorer sebelum mengulang." });
    return;
  }

  await d.repo.updateDividenItemIf(it.id, ["mengirim"], { txid: txId });
  await d.repo.logTopup(it.id, it.profile_id, "dividen_kirim", oleh, { txid: txId, arah: it.arah, units: it.jumlah_units });
  const hasil = await tungguKonfirmasi(txId, d);
  if (hasil === "confirmed") await d.repo.updateDividenItemIf(it.id, ["mengirim"], { status: "selesai" });
  else if (hasil === "rejected") await gagal("Transaksi ditolak jaringan setelah dikirim.");
  // pending: tetap 'mengirim' dengan txid; pengurus memeriksa lewat admin_dividen_ulangi
}

async function selesaikanPeriodeBilaTuntas(p: DividenPeriodeRow, d: Deps): Promise<boolean> {
  const items = await d.repo.listDividenItem(p.id);
  const sisa = items.filter((i) => i.ikut && ["menunggu", "mengirim", "gagal"].includes(i.status));
  if (sisa.length > 0) return false;
  await d.repo.updateDividenPeriodeIf(p.id, ["berjalan"], { status: "selesai", selesai_pada: iso(d.now()) });
  return true;
}

async function handleDividen(action: unknown, body: Row, d: Deps): Promise<Res> {
  switch (action) {
    // ---- anggota (tanpa PIN): status syarat dividen ----
    case "dividen_status": {
      const r = await resolveProfile(body, d, true);
      if ("error" in r) return fail(r.error);
      const s = await ambilPengaturan(d);
      const [vault, pin, sj] = await Promise.all([d.repo.getVault(r.profile.id), d.repo.getPin(r.profile.id), d.repo.getPersetujuan(r.profile.id)]);
      return ok({
        has_vault: !!vault, pin_publik: pinPublikAktif(r.profile, pin), setuju: !!sj,
        batas_minus_persen: sj ? sj.batas_minus_bp / 100 : 0, batas_sekarang_persen: s.dividen_batas_minus_bp / 100,
        perlu_perbarui: !!sj && sj.batas_minus_bp < s.dividen_batas_minus_bp,
      });
    }

    // ---- anggota (PIN): menyetujui dividen termasuk penarikan otomatis saat minus ----
    case "dividen_setuju": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      if (pinPublikAktif(a.profile, await d.repo.getPin(a.profile.id))) return fail("pin_publik");
      if (await samaDenganHashPublik(a.profile, body.pin)) return fail("pin_publik");
      if (!(await d.repo.getVault(a.profile.id))) return fail("no_vault");
      const s = await ambilPengaturan(d);
      await d.repo.upsertPersetujuan({ profile_id: a.profile.id, batas_minus_bp: s.dividen_batas_minus_bp, versi: VERSI_PERSETUJUAN, disetujui_pada: iso(d.now()) });
      await d.repo.log(a.profile.id, "dividen_setuju", true);
      return ok({ batas_minus_persen: s.dividen_batas_minus_bp / 100 });
    }

    case "dividen_cabut": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      await d.repo.deletePersetujuan(a.profile.id);
      await d.repo.log(a.profile.id, "dividen_cabut", true);
      return ok();
    }

    // ---------------- pengurus ----------------
    case "admin_dividen_lihat": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const s = await ambilPengaturan(d);
      const terbuka = body.periode_id && typeof body.periode_id === "string" ? await d.repo.getDividenPeriode(body.periode_id) : await d.repo.getDividenTerbuka();
      let kas: Record<string, unknown> | null = null;
      if (d.chain && d.chain.payoutAddress()) {
        try { const ac = await d.chain.getAccount(d.chain.payoutAddress()!); kas = { alamat: d.chain.payoutAddress(), tof_units: Number(ac.tof), algo_units: Number(ac.algo - ac.minBal) }; }
        catch { kas = { galat: true }; }
      }
      const riwayat = (await d.repo.listDividenPeriode(12)).map(tampilPeriodeDividen);
      const ditahanPer = new Map<string, { periode_id: string; label: string; jumlah: number; total_units: number }>();
      for (const it of await d.repo.listDividenItemStatus("ditahan")) {
        const e = ditahanPer.get(it.periode_id) || { periode_id: it.periode_id, label: (await d.repo.getDividenPeriode(it.periode_id))?.label || "", jumlah: 0, total_units: 0 };
        e.jumlah++; e.total_units += Number(it.jumlah_units); ditahanPer.set(it.periode_id, e);
      }
      const ditahan = Array.from(ditahanPer.values());
      return ok({
        pengaturan: { batas_minus_persen: s.dividen_batas_minus_bp / 100, min_saldo_tof: s.dividen_min_saldo_tof },
        kas, riwayat, ditahan, ...(terbuka ? await tampilDividenLengkap(terbuka, d) : { periode: null }),
      });
    }

    // Membuat pratinjau: menghitung semua kandidat dari saldo on-chain SAAT INI dan menyimpannya sebagai foto saldo
    case "admin_dividen_pratinjau": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const s = await ambilPengaturan(d);
      const label = teks(body.label, 40);
      if (!label) return fail("label_wajib");
      const bp = Number(body.persen_bp);
      if (!Number.isInteger(bp) || bp === 0 || Math.abs(bp) > 10000) return fail("persen_tidak_valid");
      if (bp < 0 && -bp > s.dividen_batas_minus_bp) return fail("minus_melebihi_batas", { batas_persen: s.dividen_batas_minus_bp / 100 });
      if (!d.chain || !d.chain.payoutAddress()) return fail("kas_belum_diatur");
      if (await d.repo.getDividenTerbuka()) return fail("periode_masih_terbuka");
      const arah = bp > 0 ? "bagi" : "potong";
      const abs = BigInt(Math.abs(bp));
      // Bulan tugas (hanya dividen positif): peserta yang tugas wajib bulan itu belum lengkap -> 'ditahan'
      if (body.bulan_tugas !== undefined && body.bulan_tugas !== "" && !(typeof body.bulan_tugas === "string" && BULAN_RE.test(body.bulan_tugas))) return fail("bulan_tidak_valid");
      const bulanTugas = arah === "bagi" && typeof body.bulan_tugas === "string" && BULAN_RE.test(body.bulan_tugas) ? body.bulan_tugas : "";

      const kasAlamat = new Set<string>([d.chain.payoutAddress()!, s.alamat_penampung, s.alamat_tarik].filter(Boolean));
      const kandidat = (await d.repo.listKandidatProfil()).filter((p) => !kasAlamat.has(p.id));
      const [vaultIds, setuju] = await Promise.all([d.repo.listVaultIds(), d.repo.listPersetujuan()]);
      const punyaVault = new Set(vaultIds);
      const sj = new Map(setuju.map((x) => [x.profile_id, x]));

      type Hasil = { p: Profile; alasan: string };
      const awal: Hasil[] = [];
      for (const p of kandidat) {
        let alasan = "";
        if (!punyaVault.has(p.id)) alasan = "Belum menitip frasa";
        else if (!sj.get(p.id)) alasan = "Belum menyetujui dividen";
        else if (arah === "potong" && sj.get(p.id)!.batas_minus_bp < -bp) alasan = "Persetujuan hanya sampai minus " + sj.get(p.id)!.batas_minus_bp / 100 + "%";
        else if (pinPublikAktif(p, await d.repo.getPin(p.id))) alasan = "PIN belum diamankan";
        awal.push({ p, alasan });
      }

      const barisItem: Record<string, unknown>[] = [];
      const layak = awal.filter((x) => !x.alasan);
      for (let i = 0; i < layak.length; i += 10) {
        await Promise.all(layak.slice(i, i + 10).map(async (x) => {
          try {
            const ac = await d.chain!.getAccount(x.p.id);
            if (!ac.tofOptin) { x.alasan = "Belum opt-in TOF"; return; }
            if (ac.tof < BigInt(s.dividen_min_saldo_tof) * 1000000n) { x.alasan = "Saldo di bawah minimum (" + s.dividen_min_saldo_tof + " TOF)"; return; }
            const kunci = await jaminanTerkunci(x.p.id, d);
            let jumlah = (ac.tof * abs) / 10000n;
            let kurang = 0n;
            if (arah === "potong") {
              const bebas = ac.tof > kunci ? ac.tof - kunci : 0n;
              if (jumlah > bebas) { kurang = jumlah - bebas; jumlah = bebas; }
            }
            if (jumlah <= 0n) { x.alasan = arah === "bagi" ? "Dividen kurang dari 1 unit TOF" : "Tidak ada TOF bebas untuk dipotong"; return; }
            barisItem.push({ profile_id: x.p.id, username: x.p.username, saldo_units: Number(ac.tof), terkunci_units: Number(kunci), arah, jumlah_units: Number(jumlah), kurang_units: Number(kurang), ikut: true, status: "menunggu", alasan: null });
          } catch (e) {
            console.error("saldo dividen:", e);
            x.alasan = "Gagal membaca saldo dari jaringan";
          }
        }));
      }
      for (const x of awal.filter((y) => y.alasan)) {
        barisItem.push({ profile_id: x.p.id, username: x.p.username, saldo_units: 0, terkunci_units: 0, arah, jumlah_units: 0, kurang_units: 0, ikut: false, status: "dilewati", alasan: x.alasan });
      }
      if (bulanTugas) {
        const k = await siapkanKonteks(d, bulanTugas, false, null);
        const peta = new Map(kandidat.map((p) => [p.id, p]));
        const sekarangIso = iso(d.now());
        for (const x of barisItem) {
          if (x.status !== "menunggu") continue;
          const p = peta.get(String(x.profile_id));
          if (!p) continue;
          const kurang = evaluasiTugas(k, p, true, true).wajib.filter((y) => !y.ok); // peserta layak sudah pasti PIN-nya aman
          if (kurang.length) {
            x.status = "ditahan"; x.tugas_kurang = kurang.map((y) => y.kunci).join("|");
            x.alasan = "Tugas belum selesai: " + kurang.map((y) => y.judul).join("; "); x.ditahan_pada = sekarangIso;
          }
        }
      }
      if (barisItem.filter((x) => x.status === "menunggu" || x.status === "ditahan").length === 0) return fail("tidak_ada_peserta", { dilewati: barisItem.length });

      const ins = await d.repo.insertDividenPeriode({ label, persen_bp: bp, status: "pratinjau", dibuat: iso(d.now()), dibuat_oleh: a.profile.id, bulan_tugas: bulanTugas || null });
      if (ins.result === "duplicate") return fail("label_sudah_dipakai");
      if (ins.result !== "ok" || !ins.row) return fail("server_error");
      await d.repo.insertDividenItems(barisItem.map((x) => ({ ...x, periode_id: ins.row!.id })));
      await d.repo.logTopup(ins.row.id, a.profile.id, "dividen_pratinjau", a.profile.id, { label, persen_bp: bp });
      return ok(await tampilDividenLengkap(ins.row, d));
    }

    // Mencentang / mengeluarkan peserta (hanya saat pratinjau)
    case "admin_dividen_pilih": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const p = typeof body.periode_id === "string" ? await d.repo.getDividenPeriode(body.periode_id) : null;
      if (!p) return fail("periode_tidak_ditemukan");
      if (p.status !== "pratinjau") return fail("status_tidak_cocok");
      const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 1000) : [];
      let diubah = 0;
      for (const id of ids) {
        const it = await d.repo.getDividenItem(id);
        if (!it || it.periode_id !== p.id) continue;
        if (await d.repo.updateDividenItemIf(id, ["menunggu"], { ikut: body.ikut === true })) diubah++;
      }
      return ok({ diubah, ...(await tampilDividenLengkap(p, d)) });
    }

    // Persetujuan pengurus. Bila pengurus lebih dari satu, penyetuju harus orang lain dari pembuat pratinjau.
    case "admin_dividen_setujui": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const p = typeof body.periode_id === "string" ? await d.repo.getDividenPeriode(body.periode_id) : null;
      if (!p) return fail("periode_tidak_ditemukan");
      if (p.status !== "pratinjau") return fail("status_tidak_cocok");
      if ((d.adminIds || []).length > 1 && p.dibuat_oleh === a.profile.id) return fail("perlu_pengurus_lain");
      const ringkas = ringkasDividen(await d.repo.listDividenItem(p.id));
      if (ringkas.peserta === 0) return fail("tidak_ada_peserta");
      if (!d.chain || !d.chain.payoutAddress()) return fail("kas_belum_diatur");
      try {
        const kas = await d.chain.getAccount(d.chain.payoutAddress()!);
        const fee = FEE_UNITS * (p.persen_bp > 0 ? 1n : 2n) * BigInt(ringkas.peserta);
        if (p.persen_bp > 0 && kas.tof < BigInt(ringkas.total_bagi_units)) return fail("kas_tof_kurang", { butuh_units: ringkas.total_bagi_units, ada_units: Number(kas.tof) });
        if (kas.algo - kas.minBal < fee) return fail("kas_algo_kurang", { butuh_units: Number(fee), ada_units: Number(kas.algo - kas.minBal) });
      } catch { return fail("gagal_baca_saldo"); }
      const baru = await d.repo.updateDividenPeriodeIf(p.id, ["pratinjau"], { status: "disetujui", disetujui_oleh: a.profile.id, disetujui_pada: iso(d.now()) });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(p.id, a.profile.id, "dividen_setujui", a.profile.id, { label: p.label, ringkas });
      return ok(await tampilDividenLengkap(baru, d));
    }

    case "admin_dividen_batal": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const p = typeof body.periode_id === "string" ? await d.repo.getDividenPeriode(body.periode_id) : null;
      if (!p) return fail("periode_tidak_ditemukan");
      if (p.status === "berjalan") return fail("sudah_berjalan");
      const baru = await d.repo.updateDividenPeriodeIf(p.id, ["pratinjau", "disetujui"], { status: "dibatalkan" });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(p.id, a.profile.id, "dividen_batal", a.profile.id, { label: p.label });
      return ok({ periode: tampilPeriodeDividen(baru) });
    }

    // Eksekusi bertahap (maks 5 item per panggilan, supaya tidak melewati batas waktu). Layar pengurus memanggil berulang sampai sisa 0.
    case "admin_dividen_jalankan": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      if (body.yakin !== true) return fail("konfirmasi_wajib");
      let p = typeof body.periode_id === "string" ? await d.repo.getDividenPeriode(body.periode_id) : null;
      if (!p) return fail("periode_tidak_ditemukan");
      let aktif = await d.repo.updateDividenPeriodeIf(p.id, ["disetujui", "berjalan"], { status: "berjalan" });
      if (!aktif && p.status === "selesai") aktif = p; // periode yang sudah selesai tetap bisa mengirim item yang dilepas/diulang
      if (!aktif) return fail("status_tidak_cocok");
      p = aktif;
      if (!d.chain) return fail("kas_belum_diatur");
      const antre = (await d.repo.listDividenItem(p.id)).filter((i) => i.ikut && i.status === "menunggu").slice(0, DIVIDEN_MAKS_PER_PANGGILAN);
      for (const it of antre) await prosesDividenItem(it, p, a.profile.id, d);
      const selesai = await selesaikanPeriodeBilaTuntas(p, d);
      const terbaru = (await d.repo.getDividenPeriode(p.id)) || p;
      return ok({ diproses: antre.length, periode_selesai: selesai, ...(await tampilDividenLengkap(terbaru, d)) });
    }

    // Item gagal → antre lagi; item 'mengirim' dengan txid → periksa jaringan; tanpa txid → butuh yakin:true setelah cek explorer
    case "admin_dividen_ulangi": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const it = typeof body.item_id === "string" ? await d.repo.getDividenItem(body.item_id) : null;
      if (!it) return fail("item_tidak_ditemukan");
      const p = await d.repo.getDividenPeriode(it.periode_id);
      if (!p || !["berjalan", "disetujui", "selesai"].includes(p.status)) return fail("status_tidak_cocok");
      if (it.status === "gagal") {
        await d.repo.updateDividenItemIf(it.id, ["gagal"], { status: "menunggu", alasan: null });
      } else if (it.status === "mengirim") {
        if (it.txid) {
          if (!d.chain) return fail("kas_belum_diatur");
          const st = await d.chain.status(it.txid);
          if (st === "confirmed") await d.repo.updateDividenItemIf(it.id, ["mengirim"], { status: "selesai", alasan: null });
          else if (st === "rejected") await d.repo.updateDividenItemIf(it.id, ["mengirim"], { status: "gagal", alasan: "Transaksi ditolak jaringan." });
        } else {
          if (body.yakin !== true) return fail("konfirmasi_wajib");
          await d.repo.updateDividenItemIf(it.id, ["mengirim"], { status: "menunggu", alasan: null });
        }
      } else return fail("status_tidak_cocok");
      await d.repo.logTopup(it.id, it.profile_id, "dividen_ulangi", a.profile.id, {});
      await selesaikanPeriodeBilaTuntas(p, d);
      return ok(await tampilDividenLengkap((await d.repo.getDividenPeriode(p.id)) || p, d));
    }

    // Melepas dividen yang ditahan. Tugas yang dulu menunggak harus sudah selesai (sejak awal bulan tugas); paksa:true = kebijakan pengurus.
    case "admin_dividen_lepas": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const it = typeof body.item_id === "string" ? await d.repo.getDividenItem(body.item_id) : null;
      if (!it) return fail("item_tidak_ditemukan");
      const p = await d.repo.getDividenPeriode(it.periode_id);
      if (!p || p.status === "dibatalkan" || it.status !== "ditahan") return fail("status_tidak_cocok");
      const paksa = body.paksa === true;
      if (!paksa) {
        const kurang = await tunggakanTugas(it, p, d);
        if (kurang.length) return fail("tugas_belum_selesai", { kurang });
      }
      const baru = await d.repo.updateDividenItemIf(it.id, ["ditahan"], { status: "menunggu", ikut: true, alasan: paksa ? "Dilepas pengurus tanpa menunggu tugas selesai." : null });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(it.id, it.profile_id, paksa ? "dividen_lepas_paksa" : "dividen_lepas", a.profile.id, {});
      if (p.status === "berjalan" || p.status === "selesai") { // periode sudah dieksekusi: kirim sekarang
        if (!d.chain) return fail("kas_belum_diatur");
        await prosesDividenItem(baru, p, a.profile.id, d);
        await selesaikanPeriodeBilaTuntas(p, d);
      }
      return ok(await tampilDividenLengkap((await d.repo.getDividenPeriode(p.id)) || p, d));
    }

    // Menghanguskan dividen yang ditahan setelah masa tahan (bawaan 3 bulan). Dananya tetap di kas bersama.
    case "admin_dividen_hanguskan": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const it = typeof body.item_id === "string" ? await d.repo.getDividenItem(body.item_id) : null;
      if (!it || it.status !== "ditahan") return fail("status_tidak_cocok");
      const s = await ambilPengaturan(d);
      const batas = new Date(Date.parse(it.ditahan_pada || iso(d.now())));
      batas.setUTCMonth(batas.getUTCMonth() + s.tugas_masa_tahan_bulan);
      if (d.now() < batas.getTime()) return fail("belum_waktunya", { sisa_hari: Math.ceil((batas.getTime() - d.now()) / 86400000) });
      const baru = await d.repo.updateDividenItemIf(it.id, ["ditahan"], { status: "hangus", alasan: "Dihanguskan: tugas tidak selesai dalam " + s.tugas_masa_tahan_bulan + " bulan. " + (it.alasan || "") });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(it.id, it.profile_id, "dividen_hangus", a.profile.id, { jumlah_units: it.jumlah_units });
      const p = await d.repo.getDividenPeriode(it.periode_id);
      return ok(p ? await tampilDividenLengkap(p, d) : {});
    }

    // Melewati item gagal tanpa mengulang (mis. anggota sudah keluar)
    case "admin_dividen_lewati": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const it = typeof body.item_id === "string" ? await d.repo.getDividenItem(body.item_id) : null;
      if (!it) return fail("item_tidak_ditemukan");
      const p = await d.repo.getDividenPeriode(it.periode_id);
      if (!p || !["berjalan", "disetujui", "selesai"].includes(p.status)) return fail("status_tidak_cocok");
      const baru = await d.repo.updateDividenItemIf(it.id, ["gagal"], { status: "dilewati", ikut: false, alasan: "Dilewati pengurus: " + (it.alasan || "") });
      if (!baru) return fail("status_tidak_cocok");
      await d.repo.logTopup(it.id, it.profile_id, "dividen_lewati", a.profile.id, {});
      await selesaikanPeriodeBilaTuntas(p, d);
      return ok(await tampilDividenLengkap((await d.repo.getDividenPeriode(p.id)) || p, d));
    }

    default:
      return await handleTugas(action, body, d);
  }
}

// ============================================================
// TUGAS — kewajiban ringan bulanan/sekali seumur hidup sebagai syarat dividen positif.
//  Jenis tugas:
//   sistem    : dihitung LANGSUNG dari keadaan akun (titip frasa, PIN aman, setuju dividen, biodata, email, nomor HP)
//   kunjungan : anggota membuka halaman (dicatat tugas.js dengan token sesi bertanda tangan, sah setelah tab aktif ~20 detik,
//               maksimal 1x per hari WIB per halaman). Halaman baru terdaftar otomatis berstatus 'baru' sampai pengurus memakainya.
//   aksi      : tindakan bermakna. Bila ada di AKSI_TABEL, dihitung dari data tabelnya (posting, Ilmu Baku, vote);
//               bila tidak, memakai catatan dari browser.
//   manual    : pengurus mencentang per anggota (atau anggota mengklaim lalu pengurus menyetujui)
//   hadir     : anggota memasukkan kode kegiatan dari pengurus selama kegiatan berlangsung
//  Tugas bisa dikelompokkan (grup + grup_min): "pilih N dari fitur ini" untuk fitur bergilir tiap bulan.
//  Dividen positif: peserta yang tugas wajibnya belum lengkap berstatus 'ditahan' (tercatat jumlahnya), bisa dilepas setelah tugas
//  selesai, atau dihanguskan setelah masa tahan (bawaan 3 bulan). Dividen minus tidak terkait tugas.
// ============================================================
export interface TugasDefRow {
  id: string; kode: string; judul: string; deskripsi: string | null; jenis: string; target: number; wajib: boolean;
  status: string; bulanan: boolean; grup: string | null; grup_min: number; url: string | null; urutan: number; dibuat: string;
}
export interface TugasCatatanRow { profile_id: string; kode: string; periode: string; jumlah: number; hari_terakhir: string | null; oleh: string | null; diubah: string }
export interface TugasKlaimRow {
  id: string; profile_id: string; kode: string; periode: string; catatan: string | null; status: string; dibuat: string;
  diproses_oleh: string | null; diproses_pada: string | null; catatan_admin: string | null;
}
export interface TugasKegiatanRow { id: string; judul: string; kode_tugas: string; kode_hadir: string; mulai: string; selesai: string; dibuat_oleh: string | null; dibuat: string; aktif: boolean }
export interface KontakRow { profile_id: string; email: string | null; no_hp: string | null }

const WIB_MS = 7 * 3600 * 1000;
const bulanWib = (ms: number) => new Date(ms + WIB_MS).toISOString().slice(0, 7);
const hariWib = (ms: number) => new Date(ms + WIB_MS).toISOString().slice(0, 10);
const BULAN_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
function awalBulanIso(bulan: string): string { const [y, m] = bulan.split("-").map(Number); return new Date(Date.UTC(y, m - 1, 1) - WIB_MS).toISOString(); }
function awalBulanBerikutIso(bulan: string): string { const [y, m] = bulan.split("-").map(Number); return new Date(Date.UTC(y, m, 1) - WIB_MS).toISOString(); }

// Tindakan yang dibuktikan dari data tabelnya (bukan klaim browser). Hanya nama tabel/kolom di daftar ini yang pernah dikueri.
const AKSI_TABEL: Record<string, { tabel: string; kolom_user: string; kolom_waktu: string }> = {
  "aksi:posting": { tabel: "contributions", kolom_user: "user_id", kolom_waktu: "created_at" },
  "aksi:ilmu_buat": { tabel: "ilmu_pending", kolom_user: "user_id", kolom_waktu: "created_at" },
  "aksi:ilmu_vote": { tabel: "votes", kolom_user: "user_id", kolom_waktu: "created_at" },
};
// Dua tugas sistem ini sudah menjadi SYARAT PESERTA dividen (bila belum, peserta dilewati), jadi tidak dipakai lagi untuk menahan.
const SISTEM_SYARAT_PESERTA = ["sistem:titip_frasa", "sistem:setuju_dividen"];
const SISTEM_KODE = ["sistem:titip_frasa", "sistem:pin_aman", "sistem:setuju_dividen", "sistem:biodata", "sistem:email", "sistem:no_hp"];
const KODE_RE = /^(aktif|login|fitur:\/([a-z0-9_\-\/.]{1,80}\.html)?|aksi:[a-z0-9_]{1,40}|manual:[a-z0-9_]{1,40}|hadir:[a-z0-9_]{1,40}|sistem:[a-z0-9_]{1,40})$/;
const TIDAK_DICATAT = /admin|login|debug|diagnosa|celebrate|youtubedownloader|transfer-masal|titik-kumpul/;
const JENIS_TUGAS = ["kunjungan", "aksi", "sistem", "manual", "hadir"];
const MAKS_DEFINISI_OTOMATIS = 500;

interface Persyaratan { kunci: string; judul: string; jenis: string; jumlah: number; target: number; ok: boolean; url: string | null; grup: string | null; wajib: boolean }

interface KonteksTugas {
  defs: TugasDefRow[]; bulan: string; sejak: boolean;
  catatan: Map<string, TugasCatatanRow[]>; aksi: Map<string, Record<string, number> | null>;
  kontak: Map<string, KontakRow>; vault: Set<string>; setuju: Set<string>;
}

async function siapkanKonteks(d: Deps, bulan: string, sejak: boolean, profileId: string | null): Promise<KonteksTugas> {
  const defs = (await d.repo.listTugasDefinisi()).filter((x) => x.status === "aktif").sort((a, b) => a.urutan - b.urutan);
  const rows = await d.repo.listTugasCatatan(bulan, sejak ? null : bulan, profileId);
  const catatan = new Map<string, TugasCatatanRow[]>();
  for (const r of rows) { const l = catatan.get(r.profile_id) || []; l.push(r); catatan.set(r.profile_id, l); }
  const awal = awalBulanIso(bulan), akhir = sejak ? null : awalBulanBerikutIso(bulan);
  const aksi = new Map<string, Record<string, number> | null>();
  for (const df of defs) {
    const peta = AKSI_TABEL[df.kode];
    if (peta && df.jenis === "aksi") aksi.set(df.kode, await d.repo.hitungAksi(peta.tabel, peta.kolom_user, peta.kolom_waktu, awal, akhir, profileId));
  }
  const [kontakRows, vaultIds, sj] = await Promise.all([d.repo.listKontak(), d.repo.listVaultIds(), d.repo.listPersetujuan()]);
  return { defs, bulan, sejak, catatan, aksi, kontak: new Map(kontakRows.map((x) => [x.profile_id, x])), vault: new Set(vaultIds), setuju: new Set(sj.map((x) => x.profile_id)) };
}

function sistemOk(kode: string, k: KonteksTugas, p: Profile, pinAman: boolean): boolean {
  const kt = k.kontak.get(p.id);
  const isi = (v: unknown) => typeof v === "string" && v.trim() !== "";
  switch (kode) {
    case "sistem:titip_frasa": return k.vault.has(p.id);
    case "sistem:pin_aman": return pinAman;
    case "sistem:setuju_dividen": return k.setuju.has(p.id);
    case "sistem:biodata": return isi(p.real_name) && isi(p.bio) && isi(p.tanggal_lahir);
    case "sistem:email": return isi(kt?.email);
    case "sistem:no_hp": return isi(kt?.no_hp);
    default: return false;
  }
}

function jumlahTugas(k: KonteksTugas, df: TugasDefRow, p: Profile, pinAman: boolean): number {
  if (df.jenis === "sistem") return sistemOk(df.kode, k, p, pinAman) ? 1 : 0;
  if (df.jenis === "aksi" && AKSI_TABEL[df.kode]) {
    const c = k.aksi.get(df.kode);
    if (c) return c[p.id] ?? 0; // terbukti dari data tabel; bila kueri gagal (null) jatuh ke catatan browser
  }
  const rows = (k.catatan.get(p.id) || []).filter((r) => r.kode === df.kode && (df.bulanan ? r.periode !== "-" : r.periode === "-"));
  return rows.reduce((n, r) => n + Number(r.jumlah), 0);
}

// Menghasilkan daftar persyaratan (tugas tunggal + kelompok "pilih N dari") beserta status terpenuhinya
function evaluasiTugas(k: KonteksTugas, p: Profile, pinAman: boolean, tanpaSyaratPeserta: boolean): { wajib: Persyaratan[]; opsional: Persyaratan[] } {
  const wajib: Persyaratan[] = [], opsional: Persyaratan[] = [];
  const baris = (df: TugasDefRow): Persyaratan => {
    const jumlah = jumlahTugas(k, df, p, pinAman);
    return { kunci: df.kode, judul: df.judul, jenis: df.jenis, jumlah, target: df.target, ok: jumlah >= df.target, url: df.url, grup: df.grup, wajib: df.wajib };
  };
  const grup = new Map<string, TugasDefRow[]>();
  for (const df of k.defs) {
    if (df.wajib && tanpaSyaratPeserta && SISTEM_SYARAT_PESERTA.includes(df.kode)) continue;
    if (!df.wajib) { opsional.push(baris(df)); continue; }
    if (df.grup) { const l = grup.get(df.grup) || []; l.push(df); grup.set(df.grup, l); continue; }
    wajib.push(baris(df));
  }
  for (const [nama, list] of grup) {
    const hasil = list.map(baris);
    const selesai = hasil.filter((x) => x.ok).length;
    const min = Math.min(Math.max(1, list[0].grup_min), list.length);
    wajib.push({ kunci: "grup:" + nama, judul: "Pilih " + min + " dari: " + list.map((x) => x.judul).join(", "), jenis: "grup", jumlah: selesai, target: min, ok: selesai >= min, url: null, grup: nama, wajib: true });
  }
  return { wajib, opsional };
}

async function pinAmanDari(p: Profile, d: Deps): Promise<boolean> {
  const row = await d.repo.getPin(p.id);
  return !!row && !pinPublikAktif(p, row);
}

// Token sesi bertanda tangan (dibuat saat login oleh buatSesi): bukti login tanpa PIN. Tanda tangan = HMAC(kunci, id.exp.salt-PIN)
async function verifikasiSesi(profileId: string, token: unknown, d: Deps): Promise<boolean> {
  if (typeof token !== "string") return false;
  const m = /^v1\.(\d{9,12})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp * 1000 <= d.now()) return false;
  const kunci = await d.repo.getSesiKunci();
  const row = await d.repo.getPin(profileId);
  if (!kunci || !row) return false;
  return timingSafeEqual(await hmacHex(kunci, `${profileId}.${exp}.${row.salt ?? ""}`), m[2]);
}

async function authSesi(body: Row, d: Deps): Promise<{ profile: Profile } | Gagal> {
  const r = await resolveProfile(body, d, true);
  if ("error" in r) return { gagal: fail(r.error) };
  if (!(await verifikasiSesi(r.profile.id, body.token, d))) return { gagal: fail("sesi_tidak_valid") };
  return { profile: r.profile };
}

function tampilTugasDef(x: TugasDefRow) {
  return { id: x.id, kode: x.kode, judul: x.judul, deskripsi: x.deskripsi, jenis: x.jenis, target: x.target, wajib: x.wajib, status: x.status, bulanan: x.bulanan, grup: x.grup, grup_min: x.grup_min, url: x.url, urutan: x.urutan };
}

// Tunggakan: tugas yang dahulu belum selesai (kunci tersimpan di item dividen) dan masih belum selesai sejak awal bulan tugas
async function tunggakanTugas(it: DividenItemRow, p: DividenPeriodeRow, d: Deps): Promise<string[]> {
  const kunci = (it.tugas_kurang || "").split("|").filter(Boolean);
  if (kunci.length === 0 || !p.bulan_tugas) return [];
  const profil = await d.repo.findProfileById(it.profile_id);
  if (!profil) return kunci;
  const k = await siapkanKonteks(d, p.bulan_tugas, true, it.profile_id);
  const ev = evaluasiTugas(k, profil, await pinAmanDari(profil, d), true);
  return ev.wajib.filter((x) => kunci.includes(x.kunci) && !x.ok).map((x) => x.judul);
}

function kodeAcak(n: number): string {
  const abjad = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const r = crypto.getRandomValues(new Uint32Array(n));
  return Array.from(r, (x) => abjad[x % abjad.length]).join("");
}

function normalisasiHp(v: string): string | null {
  const s = v.replace(/[\s().-]/g, "").replace(/^\+/, "");
  if (!/^\d{8,15}$/.test(s)) return null;
  const n = s.startsWith("0") ? "62" + s.slice(1) : s.startsWith("8") ? "62" + s : s;
  return /^62\d{8,13}$/.test(n) ? n : null;
}

async function handleTugas(action: unknown, body: Row, d: Deps): Promise<Res> {
  switch (action) {
    // ---- anggota: status kontak (tanpa PIN, hanya ya/tidak) ----
    case "kontak_status": {
      const r = await resolveProfile(body, d, true);
      if ("error" in r) return fail(r.error);
      const kt = await d.repo.getKontak(r.profile.id);
      return ok({ email_ada: !!kt?.email, hp_ada: !!kt?.no_hp });
    }

    // ---- anggota: catat kunjungan/aksi (token sesi bertanda tangan) ----
    case "tugas_catat": {
      const a = await authSesi(body, d);
      if ("gagal" in a) return a.gagal;
      const daftar = (Array.isArray(body.daftar) ? body.daftar : [{ kode: body.kode, judul: body.judul }]).slice(0, 5) as { kode?: unknown; judul?: unknown }[];
      const sekarang = d.now(), bulan = bulanWib(sekarang), hari = hariWib(sekarang);
      const diterima: string[] = [];
      for (const x of daftar) {
        const kode = teks(x?.kode, 100);
        if (!KODE_RE.test(kode)) continue;
        if (kode.startsWith("fitur:") && TIDAK_DICATAT.test(kode)) continue;
        let df = await d.repo.getTugasByKode(kode);
        if (!df) {
          if (!(kode.startsWith("fitur:") || kode === "aktif")) continue; // hanya halaman baru yang terdaftar otomatis
          if ((await d.repo.listTugasDefinisi()).length >= MAKS_DEFINISI_OTOMATIS) continue;
          const ins = await d.repo.insertTugasDefinisi({
            kode, judul: teks(x?.judul, 80) || kode, jenis: "kunjungan", target: 1, wajib: false, status: "baru", bulanan: true,
            url: kode.startsWith("fitur:") ? kode.slice(6) : null, urutan: 100,
          });
          df = ins.row ?? (await d.repo.getTugasByKode(kode));
        }
        if (!df || df.status === "nonaktif" || !["kunjungan", "aksi"].includes(df.jenis)) continue;
        await d.repo.catatTugasHari(a.profile.id, kode, df.bulanan ? bulan : "-", hari);
        diterima.push(kode);
      }
      return ok({ diterima });
    }

    // ---- anggota (tanpa PIN, hanya baca): daftar tugas dan kemajuan bulan ini + dividen yang ditahan ----
    case "tugas_status": {
      const r = await resolveProfile(body, d, true);
      if ("error" in r) return fail(r.error);
      const bulan = bulanWib(d.now());
      const k = await siapkanKonteks(d, bulan, false, r.profile.id);
      const ev = evaluasiTugas(k, r.profile, await pinAmanDari(r.profile, d), false);
      const s = await ambilPengaturan(d);
      const ditahan = [];
      for (const it of await d.repo.listDividenItemStatus("ditahan")) {
        if (it.profile_id !== r.profile.id) continue;
        const per = await d.repo.getDividenPeriode(it.periode_id);
        const batas = new Date(Date.parse(it.ditahan_pada || iso(d.now())));
        batas.setUTCMonth(batas.getUTCMonth() + s.tugas_masa_tahan_bulan);
        ditahan.push({ item_id: it.id, label: per?.label || "", jumlah_units: it.jumlah_units, tugas_kurang: it.alasan, hangus_pada: batas.toISOString(), sisa_hari: Math.ceil((batas.getTime() - d.now()) / 86400000) });
      }
      return ok({ bulan, wajib: ev.wajib, opsional: ev.opsional, lengkap: ev.wajib.every((x) => x.ok), ditahan, masa_tahan_bulan: s.tugas_masa_tahan_bulan });
    }

    // ---- anggota (PIN): mengklaim tugas manual/hadir yang dikerjakan di luar web; menunggu persetujuan pengurus ----
    case "tugas_klaim": {
      const a = await authUser(body, d);
      if ("gagal" in a) return a.gagal;
      const df = typeof body.kode === "string" ? await d.repo.getTugasByKode(body.kode) : null;
      if (!df || df.status !== "aktif" || !["manual", "hadir"].includes(df.jenis)) return fail("tugas_tidak_ditemukan");
      const periode = df.bulanan ? bulanWib(d.now()) : "-";
      const lama = await d.repo.listTugasKlaimByProfile(a.profile.id, 30);
      if (lama.some((x) => x.kode === df.kode && x.periode === periode && x.status === "menunggu")) return fail("klaim_sudah_ada");
      const ins = await d.repo.insertTugasKlaim({ profile_id: a.profile.id, kode: df.kode, periode, catatan: teks(body.catatan, 200) || null, status: "menunggu", dibuat: iso(d.now()) });
      if (ins.result !== "ok") return fail("server_error");
      return ok({ klaim_id: ins.row?.id });
    }

    // ---- anggota (token sesi): memasukkan kode hadir kegiatan ----
    case "tugas_hadir": {
      const a = await authSesi(body, d);
      if ("gagal" in a) return a.gagal;
      const kode = teks(body.kode_hadir, 12).toUpperCase();
      const keg = kode ? await d.repo.getKegiatanByKode(kode) : null;
      const sekarang = d.now();
      if (!keg || !keg.aktif) return fail("kode_hadir_salah");
      if (sekarang < Date.parse(keg.mulai) || sekarang > Date.parse(keg.selesai)) return fail("kegiatan_di_luar_waktu");
      const df = await d.repo.getTugasByKode(keg.kode_tugas);
      if (!df || df.status === "nonaktif") return fail("tugas_tidak_ditemukan");
      const hasil = await d.repo.insertKehadiran(keg.id, a.profile.id);
      if (hasil === "duplicate") return fail("sudah_hadir");
      if (hasil !== "ok") return fail("server_error");
      await d.repo.tambahTugasCatatan(a.profile.id, df.kode, df.bulanan ? bulanWib(Date.parse(keg.mulai)) : "-", null);
      return ok({ kegiatan: keg.judul, tugas: df.judul });
    }

    // ---------------- pengurus ----------------
    case "admin_tugas_lihat": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const nama = new Map<string, string>();
      const klaim = await d.repo.listTugasKlaim("menunggu", 100);
      for (const x of klaim) if (!nama.has(x.profile_id)) nama.set(x.profile_id, (await d.repo.findProfileById(x.profile_id))?.username || "");
      const s = await ambilPengaturan(d);
      return ok({
        bulan: bulanWib(d.now()), masa_tahan_bulan: s.tugas_masa_tahan_bulan,
        definisi: (await d.repo.listTugasDefinisi()).sort((x, y) => x.urutan - y.urutan).map(tampilTugasDef),
        klaim: klaim.map((x) => ({ id: x.id, profile_id: x.profile_id, username: nama.get(x.profile_id) || "", kode: x.kode, periode: x.periode, catatan: x.catatan, dibuat: x.dibuat })),
        kegiatan: await d.repo.listKegiatan(20),
      });
    }

    case "admin_tugas_simpan": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const kode = teks(body.kode, 100);
      if (!KODE_RE.test(kode)) return fail("kode_tugas_tidak_valid");
      const jenis = teks(body.jenis, 20);
      if (!JENIS_TUGAS.includes(jenis)) return fail("jenis_tidak_valid");
      if (jenis === "sistem" && !SISTEM_KODE.includes(kode)) return fail("kode_tugas_tidak_valid");
      const judul = teks(body.judul, 80);
      if (!judul) return fail("judul_wajib");
      const target = Number(body.target), gmin = Number(body.grup_min ?? 1), urut = Number(body.urutan ?? 100);
      if (!Number.isInteger(target) || target < 1 || target > 100) return fail("target_tidak_valid");
      if (!Number.isInteger(gmin) || gmin < 1 || gmin > 20) return fail("target_tidak_valid");
      const status = teks(body.status, 12);
      if (!["baru", "aktif", "nonaktif"].includes(status)) return fail("status_tidak_valid");
      const url = teks(body.url, 120);
      if (url && !url.startsWith("/")) return fail("url_tidak_valid");
      const grup = teks(body.grup, 30);
      const isi = {
        kode, judul, deskripsi: teks(body.deskripsi, 200) || null, jenis, target, wajib: body.wajib === true, status,
        bulanan: jenis === "sistem" ? false : body.bulanan !== false, grup: grup || null, grup_min: gmin, url: url || null, urutan: Number.isInteger(urut) ? urut : 100,
      };
      const ada = await d.repo.getTugasByKode(kode);
      if (ada) { const baru = await d.repo.updateTugasDefinisi(ada.id, isi); return baru ? ok({ tugas: tampilTugasDef(baru) }) : fail("server_error"); }
      const ins = await d.repo.insertTugasDefinisi(isi);
      return ins.result === "ok" && ins.row ? ok({ tugas: tampilTugasDef(ins.row) }) : fail("server_error");
    }

    // Centang manual per anggota per bulan
    case "admin_tugas_centang": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const df = typeof body.kode === "string" ? await d.repo.getTugasByKode(body.kode) : null;
      if (!df || df.jenis === "sistem") return fail("tugas_tidak_ditemukan");
      const bulan = typeof body.bulan === "string" && BULAN_RE.test(body.bulan) ? body.bulan : bulanWib(d.now());
      // profile_id = pengurus yang masuk (dipakai authAdmin); anggota yang dicentang dikirim sebagai anggota_id
      if (typeof body.anggota_id !== "string" || !(await d.repo.findProfileById(body.anggota_id))) return fail("not_found");
      await d.repo.setTugasCatatan(body.anggota_id, df.kode, df.bulanan ? bulan : "-", body.ada === false ? 0 : Math.max(df.target, 1), a.profile.id);
      await d.repo.logTopup(null, body.anggota_id, "tugas_centang", a.profile.id, { kode: df.kode, bulan, ada: body.ada !== false });
      return ok();
    }

    case "admin_tugas_klaim_proses": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const kl = typeof body.id === "string" ? await d.repo.getTugasKlaim(body.id) : null;
      if (!kl) return fail("not_found");
      const setuju = body.setuju === true;
      const baru = await d.repo.updateTugasKlaimIf(kl.id, ["menunggu"], { status: setuju ? "disetujui" : "ditolak", diproses_oleh: a.profile.id, diproses_pada: iso(d.now()), catatan_admin: teks(body.catatan, 200) || null });
      if (!baru) return fail("status_tidak_cocok");
      if (setuju) {
        const df = await d.repo.getTugasByKode(kl.kode);
        if (df) await d.repo.setTugasCatatan(kl.profile_id, df.kode, kl.periode, Math.max(df.target, 1), a.profile.id);
      }
      return ok();
    }

    // Kegiatan dengan kode hadir (untuk tugas di luar web)
    case "admin_tugas_kegiatan_buat": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const judul = teks(body.judul, 80);
      const df = typeof body.kode_tugas === "string" ? await d.repo.getTugasByKode(body.kode_tugas) : null;
      const mulai = Date.parse(String(body.mulai)), selesai = Date.parse(String(body.selesai));
      if (!judul) return fail("judul_wajib");
      if (!df || df.jenis !== "hadir") return fail("tugas_tidak_ditemukan");
      if (!Number.isFinite(mulai) || !Number.isFinite(selesai) || selesai <= mulai || selesai - mulai > 3 * 86400000) return fail("waktu_tidak_valid");
      for (let i = 0; i < 5; i++) {
        const ins = await d.repo.insertKegiatan({ judul, kode_tugas: df.kode, kode_hadir: kodeAcak(6), mulai: iso(mulai), selesai: iso(selesai), dibuat_oleh: a.profile.id, dibuat: iso(d.now()), aktif: true });
        if (ins.result === "ok" && ins.row) return ok({ kegiatan: ins.row });
        if (ins.result === "error") break;
      }
      return fail("server_error");
    }

    case "admin_tugas_kegiatan_tutup": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const keg = typeof body.id === "string" ? await d.repo.getKegiatan(body.id) : null;
      if (!keg) return fail("not_found");
      await d.repo.updateKegiatan(keg.id, { aktif: false });
      return ok();
    }

    // Rekap: siapa yang tugas wajibnya lengkap pada bulan tertentu
    case "admin_tugas_rekap": {
      const a = await authAdmin(body, d);
      if ("gagal" in a) return a.gagal;
      const bulan = typeof body.bulan === "string" && BULAN_RE.test(body.bulan) ? body.bulan : bulanWib(d.now());
      const s = await ambilPengaturan(d);
      const kas = new Set<string>([d.chain?.payoutAddress() ?? "", s.alamat_penampung, s.alamat_tarik].filter(Boolean));
      const profiles = (await d.repo.listKandidatProfil()).filter((p) => !kas.has(p.id));
      const k = await siapkanKonteks(d, bulan, false, null);
      const hasil: { profile_id: string; username: string; lengkap: boolean; kurang: string[]; selesai: number; total: number }[] = [];
      for (let i = 0; i < profiles.length; i += 20) {
        await Promise.all(profiles.slice(i, i + 20).map(async (p) => {
          const ev = evaluasiTugas(k, p, await pinAmanDari(p, d), false);
          hasil.push({ profile_id: p.id, username: p.username, lengkap: ev.wajib.every((x) => x.ok), kurang: ev.wajib.filter((x) => !x.ok).map((x) => x.judul), selesai: ev.wajib.filter((x) => x.ok).length, total: ev.wajib.length });
        }));
      }
      hasil.sort((x, y) => Number(x.lengkap) - Number(y.lengkap) || x.username.localeCompare(y.username));
      return ok({ bulan, daftar: hasil });
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
// Actions: check | login | set_pin | register | deposit | reveal | ganti_pin | vault_status | update_profil
//          + topup_* | tarik_* | admin_* (Nabung & Tarik) + pinjam_* | admin_pinjam_* (Pinjam ke diri sendiri)
//          + dividen_* | admin_dividen_* (Dividen positif/negatif) + tugas_* | admin_tugas_* | kontak_status (Tugas)
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
  async updateProfileFields(id, patch) {
    const { error } = await db.from("profiles").update(patch).eq("id", id);
    if (!error) return "ok";
    console.error("updateProfileFields:", error.message);
    return error.code === "23505" ? "duplicate" : "error";
  },
  async getSesiKunci() {
    const { data, error } = await db.from("tof_secret").select("value").eq("name", "sesi_kunci").maybeSingle();
    if (error) { console.error("getSesiKunci:", error.message); return null; }
    return ((data as { value?: string } | null)?.value) ?? null;
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

  // ---------------- Pinjam ke diri sendiri ----------------
  async insertPinjaman(row) {
    const { data, error } = await db.from("pinjaman").insert(row).select().single();
    if (!error) return { result: "ok", row: data as PinjamanRow };
    if (error.code === "23505") return { result: "duplicate" }; // sudah ada pinjaman berjalan
    console.error("insertPinjaman:", error.message);
    return { result: "error" };
  },
  async getPinjaman(id) {
    return must(await db.from("pinjaman").select("*").eq("id", id).maybeSingle()) as PinjamanRow | null;
  },
  async updatePinjamanIf(id, expect, patch, bungaExpect) {
    const q = db.from("pinjaman").update(patch).eq("id", id).in("status", expect);
    const q2 = bungaExpect ? q.in("bunga_status", bungaExpect) : q;
    return must(await q2.select().maybeSingle()) as PinjamanRow | null;
  },
  async listPinjamanByProfile(profileId, limit) {
    return must(await db.from("pinjaman").select("*").eq("profile_id", profileId).order("dibuat", { ascending: false }).limit(limit)) as PinjamanRow[];
  },
  async listPinjamanBerjalan(profileId) {
    return must(await db.from("pinjaman").select("*").eq("profile_id", profileId).in("status", ["diajukan", "aktif", "dibayar"])) as PinjamanRow[];
  },
  async listPinjamanByStatus(statuses, limit, urut) {
    const q = db.from("pinjaman").select("*").in("status", statuses);
    const o = urut === "tempo_asc" ? q.order("jatuh_tempo", { ascending: true }) : q.order("dibuat", { ascending: urut === "dibuat_asc" });
    return must(await o.limit(limit)) as PinjamanRow[];
  },
  async sumBungaPinjamanSince(sinceIso) {
    const rows = must(await db.from("pinjaman").select("bunga_tof_units")
      .in("bunga_status", ["mengirim", "terkirim"]).gte("bunga_kirim_pada", sinceIso)) as { bunga_tof_units: number }[];
    return (rows || []).reduce((n, r) => n + Number(r.bunga_tof_units), 0);
  },

  // ---------------- Dividen ----------------
  async insertDividenPeriode(row) {
    const { data, error } = await db.from("dividen_periode").insert(row).select().single();
    if (!error) return { result: "ok", row: data as DividenPeriodeRow };
    if (error.code === "23505") return { result: "duplicate" }; // label sudah dipakai
    console.error("insertDividenPeriode:", error.message);
    return { result: "error" };
  },
  async getDividenPeriode(id) {
    return must(await db.from("dividen_periode").select("*").eq("id", id).maybeSingle()) as DividenPeriodeRow | null;
  },
  async updateDividenPeriodeIf(id, expect, patch) {
    return must(await db.from("dividen_periode").update(patch).eq("id", id).in("status", expect).select().maybeSingle()) as DividenPeriodeRow | null;
  },
  async getDividenTerbuka() {
    return must(await db.from("dividen_periode").select("*").in("status", ["pratinjau", "disetujui", "berjalan"]).limit(1).maybeSingle()) as DividenPeriodeRow | null;
  },
  async listDividenPeriode(limit) {
    return must(await db.from("dividen_periode").select("*").order("dibuat", { ascending: false }).limit(limit)) as DividenPeriodeRow[];
  },
  async insertDividenItems(rows) {
    for (let i = 0; i < rows.length; i += 200) must(await db.from("dividen_item").insert(rows.slice(i, i + 200)));
  },
  async listDividenItem(periodeId) {
    return must(await db.from("dividen_item").select("*").eq("periode_id", periodeId).order("username", { ascending: true }).limit(1000)) as DividenItemRow[];
  },
  async getDividenItem(id) {
    return must(await db.from("dividen_item").select("*").eq("id", id).maybeSingle()) as DividenItemRow | null;
  },
  async updateDividenItemIf(id, expect, patch) {
    return must(await db.from("dividen_item").update(patch).eq("id", id).in("status", expect).select().maybeSingle()) as DividenItemRow | null;
  },
  async getPersetujuan(profileId) {
    return must(await db.from("dividen_persetujuan").select("*").eq("profile_id", profileId).maybeSingle()) as PersetujuanRow | null;
  },
  async upsertPersetujuan(row) {
    must(await db.from("dividen_persetujuan").upsert(row, { onConflict: "profile_id" }));
  },
  async deletePersetujuan(profileId) {
    must(await db.from("dividen_persetujuan").delete().eq("profile_id", profileId));
  },
  async listPersetujuan() {
    return must(await db.from("dividen_persetujuan").select("*").limit(1000)) as PersetujuanRow[];
  },
  async listVaultIds() {
    const rows = must(await db.from("wallet_vault").select("profile_id").limit(1000)) as { profile_id: string }[];
    return (rows || []).map((r) => r.profile_id);
  },
  async listKandidatProfil() {
    return must(await db.from("profiles").select("id,username,pin_hash,real_name,bio,tanggal_lahir").limit(1000)) as Profile[];
  },

  // ---------------- Tugas ----------------
  async listTugasDefinisi() {
    return must(await db.from("tugas_definisi").select("*").limit(1000)) as TugasDefRow[];
  },
  async getTugasByKode(kode) {
    return must(await db.from("tugas_definisi").select("*").eq("kode", kode).maybeSingle()) as TugasDefRow | null;
  },
  async insertTugasDefinisi(row) {
    const { data, error } = await db.from("tugas_definisi").insert(row).select().single();
    if (!error) return { result: "ok", row: data as TugasDefRow };
    if (error.code === "23505") return { result: "duplicate" };
    console.error("insertTugasDefinisi:", error.message);
    return { result: "error" };
  },
  async updateTugasDefinisi(id, patch) {
    return must(await db.from("tugas_definisi").update(patch).eq("id", id).select().maybeSingle()) as TugasDefRow | null;
  },
  async catatTugasHari(profileId, kode, periode, hari) {
    const row = must(await db.from("tugas_catatan").select("*").eq("profile_id", profileId).eq("kode", kode).eq("periode", periode).maybeSingle()) as TugasCatatanRow | null;
    const now = new Date().toISOString();
    if (row) {
      if (row.hari_terakhir === hari) return;
      must(await db.from("tugas_catatan").update({ jumlah: Number(row.jumlah) + 1, hari_terakhir: hari, diubah: now }).eq("profile_id", profileId).eq("kode", kode).eq("periode", periode));
    } else {
      const { error } = await db.from("tugas_catatan").insert({ profile_id: profileId, kode, periode, jumlah: 1, hari_terakhir: hari, diubah: now });
      if (error && error.code !== "23505") throw new Error(error.message);
    }
  },
  async setTugasCatatan(profileId, kode, periode, jumlah, oleh) {
    must(await db.from("tugas_catatan").upsert({ profile_id: profileId, kode, periode, jumlah, oleh, diubah: new Date().toISOString() }, { onConflict: "profile_id,kode,periode" }));
  },
  async tambahTugasCatatan(profileId, kode, periode, oleh) {
    const row = must(await db.from("tugas_catatan").select("*").eq("profile_id", profileId).eq("kode", kode).eq("periode", periode).maybeSingle()) as TugasCatatanRow | null;
    must(await db.from("tugas_catatan").upsert({ profile_id: profileId, kode, periode, jumlah: (row ? Number(row.jumlah) : 0) + 1, oleh, diubah: new Date().toISOString() }, { onConflict: "profile_id,kode,periode" }));
  },
  async listTugasCatatan(dari, sampai, profileId) {
    const filter = sampai ? `periode.eq.-,and(periode.gte.${dari},periode.lte.${sampai})` : `periode.eq.-,periode.gte.${dari}`;
    const q = db.from("tugas_catatan").select("*").or(filter);
    const q2 = profileId ? q.eq("profile_id", profileId) : q;
    return must(await q2.limit(5000)) as TugasCatatanRow[];
  },
  async hitungAksi(tabel, kolomUser, kolomWaktu, sinceIso, untilIso, profileId) {
    // hanya tabel/kolom yang tercantum di AKSI_TABEL yang boleh dikueri
    if (!Object.values(AKSI_TABEL).some((x) => x.tabel === tabel && x.kolom_user === kolomUser && x.kolom_waktu === kolomWaktu)) return null;
    let q = db.from(tabel).select(kolomUser).gte(kolomWaktu, sinceIso);
    if (untilIso) q = q.lt(kolomWaktu, untilIso);
    if (profileId) q = q.eq(kolomUser, profileId);
    const { data, error } = await q.limit(5000);
    if (error) { console.error("hitungAksi " + tabel + ":", error.message); return null; }
    const out: Record<string, number> = {};
    for (const r of (data || []) as unknown as Record<string, unknown>[]) { const u = String(r[kolomUser]); out[u] = (out[u] || 0) + 1; }
    return out;
  },
  async insertTugasKlaim(row) {
    const { data, error } = await db.from("tugas_klaim").insert(row).select().single();
    if (error) { console.error("insertTugasKlaim:", error.message); return { result: "error" }; }
    return { result: "ok", row: data as TugasKlaimRow };
  },
  async getTugasKlaim(id) {
    return must(await db.from("tugas_klaim").select("*").eq("id", id).maybeSingle()) as TugasKlaimRow | null;
  },
  async updateTugasKlaimIf(id, expect, patch) {
    return must(await db.from("tugas_klaim").update(patch).eq("id", id).in("status", expect).select().maybeSingle()) as TugasKlaimRow | null;
  },
  async listTugasKlaim(status, limit) {
    return must(await db.from("tugas_klaim").select("*").eq("status", status).order("dibuat", { ascending: true }).limit(limit)) as TugasKlaimRow[];
  },
  async listTugasKlaimByProfile(profileId, limit) {
    return must(await db.from("tugas_klaim").select("*").eq("profile_id", profileId).order("dibuat", { ascending: false }).limit(limit)) as TugasKlaimRow[];
  },
  async insertKegiatan(row) {
    const { data, error } = await db.from("tugas_kegiatan").insert(row).select().single();
    if (!error) return { result: "ok", row: data as TugasKegiatanRow };
    if (error.code === "23505") return { result: "duplicate" };
    console.error("insertKegiatan:", error.message);
    return { result: "error" };
  },
  async getKegiatan(id) {
    return must(await db.from("tugas_kegiatan").select("*").eq("id", id).maybeSingle()) as TugasKegiatanRow | null;
  },
  async getKegiatanByKode(kodeHadir) {
    return must(await db.from("tugas_kegiatan").select("*").eq("kode_hadir", kodeHadir).maybeSingle()) as TugasKegiatanRow | null;
  },
  async updateKegiatan(id, patch) {
    must(await db.from("tugas_kegiatan").update(patch).eq("id", id));
  },
  async listKegiatan(limit) {
    return must(await db.from("tugas_kegiatan").select("*").order("dibuat", { ascending: false }).limit(limit)) as TugasKegiatanRow[];
  },
  async insertKehadiran(kegiatanId, profileId) {
    const { error } = await db.from("tugas_kehadiran").insert({ kegiatan_id: kegiatanId, profile_id: profileId });
    if (!error) return "ok";
    return error.code === "23505" ? "duplicate" : "error";
  },
  async getKontak(profileId) {
    return must(await db.from("profil_kontak").select("*").eq("profile_id", profileId).maybeSingle()) as KontakRow | null;
  },
  async upsertKontak(profileId, patch) {
    must(await db.from("profil_kontak").upsert({ profile_id: profileId, ...patch, diubah: new Date().toISOString() }, { onConflict: "profile_id" }));
  },
  async listKontak() {
    return must(await db.from("profil_kontak").select("profile_id,email,no_hp").limit(1000)) as KontakRow[];
  },
  async listDividenItemStatus(status) {
    return must(await db.from("dividen_item").select("*").eq("status", status).limit(1000)) as DividenItemRow[];
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
  // Potongan dividen: TOF dari dompet anggota ke dompet pembayar. Dua transaksi sekelompok (atomik): TOF anggota (biaya 0) +
  // pembayaran 0 dari dompet pembayar dengan biaya 2x, sehingga anggota tidak perlu memegang ALGO.
  // Kunci anggota hanya ada di memori selama panggilan ini; frasa tidak pernah dicatat atau dikirim ke mana pun.
  async sendTofDariAnggota({ mnemonic, to, amount, note, leaseKey }) {
    if (!payout) throw { kind: "ditolak", message: "dompet pembayar belum diatur" };
    let blob: Uint8Array, txId: string;
    try {
      const anggota = algosdk.mnemonicToSecretKey(mnemonic);
      const p = await algodGet("/v2/transactions/params");
      const sp = { flatFee: true, firstRound: p["last-round"], lastRound: p["last-round"] + 1000, genesisID: p["genesis-id"], genesisHash: p["genesis-hash"] };
      const lease = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("topup:" + leaseKey)));
      const tx1 = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: String(anggota.addr), to, amount, assetIndex: TOF_ASSET_ID, note: new TextEncoder().encode(note), suggestedParams: { ...sp, fee: 0 },
      });
      tx1.addLease(lease); // lease dipasang SEBELUM group ID dihitung
      const tx2 = algosdk.makePaymentTxnWithSuggestedParamsFromObject({ from: payout.addr, to: payout.addr, amount: 0, suggestedParams: { ...sp, fee: 2000 } });
      algosdk.assignGroupID([tx1, tx2]);
      const b1 = tx1.signTxn(anggota.sk);
      const b2 = tx2.signTxn(payout.sk);
      blob = new Uint8Array(b1.length + b2.length);
      blob.set(b1, 0);
      blob.set(b2, b1.length);
      txId = tx1.txID();
    } catch (e) {
      throw { kind: "ditolak", message: "gagal menyiapkan transaksi: " + (e instanceof Error ? e.message : String(e)) }; // belum dikirim
    }
    let res: Response;
    try {
      res = await fetch(ALGOD + "/v2/transactions", { method: "POST", headers: { "Content-Type": "application/x-binary" }, body: blob });
    } catch (_e) {
      throw { kind: "ambigu", message: "jaringan putus saat mengirim" };
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
