from fastapi import FastAPI
from app.api.v1.routes import router
from app.core.config import init_supabase

app = FastAPI(title="ToFarmer API")

# IMPORTANT: init dulu sebelum routes dipakai
init_supabase()

app.include_router(router, prefix="/api/v1")