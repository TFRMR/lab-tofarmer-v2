import os
import time
import datetime
import hashlib

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client, Client
from pydantic import BaseModel

# =========================
# LOAD ENV
# =========================
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise Exception("ENV ERROR")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="ToFarmer Social Engine V5")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# GLOBAL STATE (fallback anti spam)
# =========================
GLOBAL_STATE = {
    "last_action": {}
}

# =========================
# MODELS
# =========================
class User(BaseModel):
    id: str
    username: str | None = None

class Contribution(BaseModel):
    user_id: str
    pilar_aksi: int
    judul_aksi: str
    deskripsi_proses: str
    media_url: str | None = None

class Like(BaseModel):
    user_id: str
    contribution_id: int

class Comment(BaseModel):
    user_id: str
    contribution_id: int
    message: str

class AdminValidate(BaseModel):
    contribution_id: int
    status: str  # VALID / REJECTED

# =========================
# ROOT
# =========================
@app.get("/")
def root():
    return {"status": "OK", "system": "ToFarmer Social Engine V5"}

# =========================
# PROFILE GET
# =========================
@app.get("/profile/{user_id}")
def get_profile(user_id: str):
    res = supabase.table("profil").select("*").eq("id", user_id).execute()
    if not res.data:
        return {"error": "not found"}
    return res.data[0]

# =========================
# SIMPLE ANTI SPAM
# =========================
def anti_spam(user_id: str, seconds: int = 3):
    now = time.time()
    last = GLOBAL_STATE["last_action"].get(user_id, 0)

    if now - last < seconds:
        return False

    GLOBAL_STATE["last_action"][user_id] = now
    return True

# =========================
# CREATE CONTRIBUTION (POST)
# =========================
@app.post("/contribution/create")
def create_contribution(data: Contribution):

    if not anti_spam(data.user_id, 2):
        return {"error": "too fast"}

    # insert POST (langsung tampil di feed)
    res = supabase.table("contributions").insert({
        "user_id": data.user_id,
        "pilar_aksi": data.pilar_aksi,
        "judul_aksi": data.judul_aksi,
        "deskripsi_proses": data.deskripsi_proses,
        "media_url": data.media_url,
        "status_validasi": "PENDING"
    }).execute()

    return {
        "status": "posted",
        "visible": True,
        "data": res.data
    }

# =========================
# FEED (PUBLIC - SEMUA POST MASUK)
# =========================
@app.get("/feed")
def feed(limit: int = 50):

    res = supabase.table("contributions") \
        .select("*") \
        .order("created_at", desc=True) \
        .limit(limit) \
        .execute()

    return {"feed": res.data}

# =========================
# LIKE SYSTEM
# =========================
@app.post("/like")
def like(data: Like):

    supabase.table("likes").insert({
        "user_id": data.user_id,
        "post_id": data.contribution_id
    }).execute()

    # update counter sederhana
    post = supabase.table("contributions").select("likes_count").eq("id", data.contribution_id).execute()

    if post.data:
        count = post.data[0].get("likes_count", 0) + 1

        supabase.table("contributions").update({
            "likes_count": count
        }).eq("id", data.contribution_id).execute()

    return {"status": "liked"}

# =========================
# COMMENT SYSTEM
# =========================
@app.post("/comment")
def comment(data: Comment):

    supabase.table("comments").insert({
        "user_id": data.user_id,
        "post_id": data.contribution_id,
        "comment": data.message
    }).execute()

    return {"status": "commented"}

# =========================
# ADMIN VALIDATION
# =========================
@app.post("/admin/validate")
def validate(data: AdminValidate):

    if data.status not in ["VALID", "REJECTED"]:
        return {"error": "invalid status"}

    supabase.table("contributions").update({
        "status_validasi": data.status
    }).eq("id", data.contribution_id).execute()

    return {"status": "updated"}

# =========================
# XP + REWARD ENGINE
# =========================
def give_reward(user_id: str, amount: float, xp: int, reason: str):

    profile = supabase.table("profil").select("*").eq("id", user_id).execute()
    if not profile.data:
        return

    p = profile.data[0]

    new_balance = p["saldo_tof"] + amount
    new_xp = p["xp"] + xp

    # level sederhana
    level = 1 + new_xp // 100
    rank = "GROWER" if new_xp < 3000 else "PRO" if new_xp < 9000 else "ELITE"

    supabase.table("profil").update({
        "saldo_tof": new_balance,
        "xp": new_xp,
        "level": level,
        "rank": rank
    }).eq("id", user_id).execute()

    supabase.table("financial_ledger").insert({
        "user_id": user_id,
        "jumlah_tof": amount,
        "tipe_transaksi": reason,
        "total_pool_snapshot": new_balance
    }).execute()

# =========================
# AUTO PROCESS CONTRIBUTION REWARD
# =========================
@app.post("/engine/process/{contribution_id}")
def process(contribution_id: int):

    post = supabase.table("contributions").select("*").eq("id", contribution_id).execute()

    if not post.data:
        return {"error": "not found"}

    p = post.data[0]

    status = p.get("status_validasi", "PENDING")

    # reward logic
    if status == "VALID":
        reward = 10 + (p["pilar_aksi"] * 2)
        xp = 20
        reason = "VALID_CONTRIBUTION"

    elif status == "PENDING":
        reward = 2
        xp = 5
        reason = "PENDING_CONTRIBUTION"

    else:
        reward = 0
        xp = 0
        reason = "REJECTED_CONTRIBUTION"

    if reward > 0:
        give_reward(p["user_id"], reward, xp, reason)

    # blockchain proof tipis (hash saja)
    proof = hashlib.sha256(
        f"{p['user_id']}{p['judul_aksi']}{time.time()}".encode()
    ).hexdigest()

    supabase.table("blockchain_proofs").insert({
        "user_id": p["user_id"],
        "event_type": "CONTRIBUTION",
        "proof_hash": proof,
        "tx_hash": None
    }).execute()

    return {
        "status": "processed",
        "reward": reward,
        "xp": xp
    }

# =========================
# LEADERBOARD
# =========================
@app.get("/leaderboard")
def leaderboard():

    res = supabase.table("profil") \
        .select("*") \
        .order("xp", desc=True) \
        .limit(20) \
        .execute()

    return {"leaderboard": res.data}

# =========================
# PRICE ENGINE SIMPLE
# =========================
@app.get("/price")
def price():

    ledger = supabase.table("financial_ledger").select("jumlah_tof").execute()
    profiles = supabase.table("profil").select("saldo_tof").execute()

    minted = sum([x["jumlah_tof"] for x in ledger.data]) if ledger.data else 0
    supply = sum([x["saldo_tof"] for x in profiles.data]) if profiles.data else 1

    price = minted / (supply + 1)

    return {"price": round(price, 6)}