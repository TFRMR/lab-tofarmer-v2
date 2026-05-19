import os
import time
import datetime
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

app = FastAPI(title="ToFarmer Engine V4 FULL")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# GLOBAL STATE
# =========================
GLOBAL_STATE = {
    "last_reward_time": {},
}

# =========================
# MODELS
# =========================
class Wallet(BaseModel):
    wallet: str
    username: str | None = None

class ActivityRequest(BaseModel):
    wallet: str
    pilar: int
    activity_type: str
    weight: float = 1

class RewardRequest(BaseModel):
    wallet: str
    amount: float = 10
    reason: str = "MANUAL"

# =========================
# ROOT
# =========================
@app.get("/")
def root():
    return {"status": "OK", "system": "ToFarmer FULL ENGINE"}

# =========================
# WALLET LOGIN
# =========================
@app.post("/auth/wallet")
def wallet_login(data: Wallet):

    username = data.username or f"user_{data.wallet[:6]}"

    user = supabase.table("profiles").select("*").eq("id", data.wallet).execute()

    if not user.data:
        supabase.table("profiles").insert({
            "id": data.wallet,
            "username": username,
            "saldo_tof": 0,
            "xp": 0,
            "power": 0,
            "level": 1,
            "rank": "GROWER"
        }).execute()

        return {"status": "created"}

    return {"status": "exists"}

# =========================
# ANTI SPAM SYSTEM (DATABASE PERSISTENT)
# =========================
def anti_spam(wallet: str, seconds: int = 10):
    try:
        # Ambil 1 log aktivitas terbaru dari database untuk wallet ini
        last_log = supabase.table("activity_log")\
            .select("created_at")\
            .eq("user_id", wallet)\
            .order("created_at", descending=True)\
            .limit(1)\
            .execute()
        
        if last_log.data:
            # Ambil string waktu dan bersihkan format ISO dari Supabase
            created_at_str = last_log.data[0]["created_at"].replace("Z", "+00:00")
            last_time = datetime.datetime.fromisoformat(created_at_str).timestamp()
            now = time.time()
            
            if now - last_time < seconds:
                return False
                
        return True
    except Exception:
        # Fallback ke memory state jika database request mengalami kendala sementara
        now = time.time()
        last = GLOBAL_STATE["last_reward_time"].get(wallet, 0)
        if now - last < seconds:
            return False
        GLOBAL_STATE["last_reward_time"][wallet] = now
        return True

# =========================
# LEVEL ENGINE
# =========================
def calculate_level(xp: int):
    if xp < 3000:
        return 1 + int(xp / 100)
    elif xp < 9000:
        return 31 + int((xp - 3000) / 200)
    elif xp < 33000:
        return 61 + int((xp - 9000) / 500)
    else:
        return min(99, 91 + int((xp - 33000) / 1000))

def calculate_rank(xp: int):
    if xp < 3000:
        return "GROWER"
    elif xp < 9000:
        return "PRO"
    elif xp < 33000:
        return "SPECIALIST"
    return "ELITE"

# =========================
# TIME ENGINE (LOG ONLY)
# =========================
@app.post("/engine/time/log")
def time_log(data: ActivityRequest):

    if not supabase.table("profiles").select("*").eq("id", data.wallet).execute().data:
        return {"error": "wallet not found"}

    supabase.table("activity_log").insert({
        "user_id": data.wallet,
        "pilar": data.pilar,
        "activity_type": data.activity_type,
        "weight": data.weight
    }).execute()

    return {"status": "logged"}

# =========================
# REWARD ENGINE (MANUAL)
# =========================
@app.post("/engine/reward")
def reward(data: RewardRequest):

    if not anti_spam(data.wallet):
        return {"error": "spam"}

    user = supabase.table("profiles").select("*").eq("id", data.wallet).execute()
    if not user.data:
        return {"error": "not found"}

    profile = user.data[0]

    new_balance = profile["saldo_tof"] + data.amount

    supabase.table("profiles").update({
        "saldo_tof": new_balance
    }).eq("id", data.wallet).execute()

    supabase.table("financial_ledger").insert({
        "user_id": data.wallet,
        "jumlah_tof": data.amount,
        "tipe_transaksi": data.reason,
        "total_pool_snapshot": new_balance
    }).execute()

    return {
        "wallet": data.wallet,
        "reward": data.amount,
        "balance": new_balance
    }

# =========================
# MAIN ENGINE (ONE FLOW SYSTEM)
# =========================
@app.post("/engine/activity")
def engine_activity(data: ActivityRequest):

    if not anti_spam(data.wallet, 5):
        return {"error": "cooldown"}

    user = supabase.table("profiles").select("*").eq("id", data.wallet).execute()
    if not user.data:
        return {"error": "wallet not found"}

    profile = user.data[0]

    # ================= reward =================
    reward_amount = 2 + (data.pilar * 0.5) + data.weight

    # ================= xp =================
    xp_gain = 5 + (data.pilar * 2)

    new_xp = profile["xp"] + xp_gain
    new_level = calculate_level(new_xp)
    new_rank = calculate_rank(new_xp)

    new_balance = profile["saldo_tof"] + reward_amount

    # ================= update profile =================
    supabase.table("profiles").update({
        "saldo_tof": new_balance,
        "xp": new_xp,
        "level": new_level,
        "rank": new_rank
    }).eq("id", data.wallet).execute()

    # ================= ledger =================
    supabase.table("financial_ledger").insert({
        "user_id": data.wallet,
        "jumlah_tof": reward_amount,
        "tipe_transaksi": "AUTO_ACTIVITY",
        "total_pool_snapshot": new_balance
    }).execute()

    # ================= activity log =================
    supabase.table("activity_log").insert({
        "user_id": data.wallet,
        "pilar": data.pilar,
        "activity_type": data.activity_type,
        "weight": data.weight,
        "reward_received": reward_amount,
        "xp_received": xp_gain
    }).execute()

    return {
        "wallet": data.wallet,
        "reward": reward_amount,
        "xp": new_xp,
        "level": new_level,
        "rank": new_rank,
        "balance": new_balance
    }

# =========================
# LIVE PRICE ENGINE
# =========================
@app.get("/engine/price")
def price():

    ledger = supabase.table("financial_ledger").select("jumlah_tof").execute()
    minted = sum([x["jumlah_tof"] for x in ledger.data]) if ledger.data else 0

    users = supabase.table("profiles").select("saldo_tof").execute()
    supply = sum([x["saldo_tof"] for x in users.data]) if users.data else 1

    price = minted / (supply + 1)

    return {"price": round(price, 6)}