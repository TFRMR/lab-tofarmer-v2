from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def home():
    return {
        "status": "OK",
        "system": "ToFarmer API V5"
    }


@router.get("/feed")
def feed():
    return {
        "message": "feed connected"
    }


@router.get("/profile/{user_id}")
def get_profile(user_id: str):
    return {
        "user_id": user_id,
        "status": "connected"
    }