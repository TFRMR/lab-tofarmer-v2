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
