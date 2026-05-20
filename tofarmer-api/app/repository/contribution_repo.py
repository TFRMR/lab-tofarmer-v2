from app.core.config import supabase

def db():
    if supabase is None:
        raise Exception("Supabase not initialized")
    return supabase

class ContributionRepository:

    @staticmethod
    def create(data: dict):
        return (
            supabase.table("contributions")
            .insert(data)
            .execute()
        )

    @staticmethod
    def get_feed(limit: int = 50):
        return (
            supabase.table("contributions")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

    @staticmethod
    def get_by_id(contribution_id: int):
        return (
            supabase.table("contributions")
            .select("*")
            .eq("id", contribution_id)
            .execute()
        )

    @staticmethod
    def validate(contribution_id: int, status: str):
        return (
            supabase.table("contributions")
            .update({
                "status_validasi": status
            })
            .eq("id", contribution_id)
            .execute()
        )

    @staticmethod
    def increment_like(contribution_id: int):

        post = (
            supabase.table("contributions")
            .select("likes_count")
            .eq("id", contribution_id)
            .execute()
        )

        if not post.data:
            return None

        count = post.data[0].get("likes_count", 0) + 1

        return (
            supabase.table("contributions")
            .update({"likes_count": count})
            .eq("id", contribution_id)
            .execute()
        )