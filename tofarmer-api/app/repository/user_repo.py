from app.core.config import supabase

def db():
    if supabase is None:
        raise Exception("Supabase not initialized")
    return supabase


class UserRepository:

    @staticmethod
    def get_profiles(user_id: str):
        return (
            db()
            .table("profiles")
            .select("*")
            .eq("id", user_id)
            .execute()
        )

    @staticmethod
    def update_profiles(user_id: str, data: dict):
        return (
            db()
            .table("profiles")
            .update(data)
            .eq("id", user_id)
            .execute()
        )

    @staticmethod
    def leaderboard(limit: int = 20):
        return (
            db()
            .table("profiles")
            .select("*")
            .order("xp", desc=True)
            .limit(limit)
            .execute()
        )