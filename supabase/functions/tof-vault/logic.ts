// ============================================================
// logic.ts — seluruh aturan keamanan (tanpa Supabase/Deno langsung),
// supaya bisa diuji dengan repo palsu di memori.
// ============================================================
import {
  checkPin,
  decryptMnemonic,
  encryptMnemonic,
  isValidPin,
  isValidUsername,
  makePinRecord,
  normalizeMnemonic,
} from "./lib.ts";

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

// Akun lama yang hash PIN-nya masih ada di kolom profiles.pin_hash (bisa dibaca publik, dan PIN 6 digit
// mudah ditebak dari hash itu). Untuk akun seperti ini brankas frasa belum boleh dipakai.
function hasPublicPinHash(p: Profile): boolean {
  return typeof p.pin_hash === "string" && p.pin_hash !== "";
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
      if (hasPublicPinHash(r.profile)) return fail("pin_publik");
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
      if (hasPublicPinHash(r.profile)) return fail("pin_publik");
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

    // ---- Status brankas (tanpa PIN): dipakai halaman Dompet untuk menampilkan tombol yang sesuai ----
    case "vault_status": {
      const r = await resolveProfile(body, d, true);
      if ("error" in r) return fail(r.error);
      const vault = await d.repo.getVault(r.profile.id);
      const pin = await d.repo.getPin(r.profile.id);
      return ok({ has_vault: !!vault, has_pin: !!pin, pin_publik: hasPublicPinHash(r.profile) });
    }

    default:
      return fail("unknown_action");
  }
}
