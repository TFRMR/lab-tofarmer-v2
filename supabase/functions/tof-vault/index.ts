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
import { createClient } from "npm:@supabase/supabase-js@2";
import algosdk from "npm:algosdk@2.4.0";
import { escapeLike } from "./lib.ts";
import { handle } from "./logic.ts";
import type { BatchRow, Chain, Deps, PinRow, Profile, Repo, TopupRow, VaultRow } from "./logic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MASTER_KEY = Deno.env.get("VAULT_MASTER_KEY") ?? "";
const PEPPER = Deno.env.get("PIN_PEPPER") ?? "";
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
