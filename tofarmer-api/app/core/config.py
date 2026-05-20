import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client | None = None

def init_supabase():
    global supabase

    if not SUPABASE_URL or not SUPABASE_KEY:
        raise Exception("ENV missing: SUPABASE_URL / SUPABASE_KEY")

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return supabase