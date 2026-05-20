from app.core.config import supabase

def db():
    if supabase is None:
        raise Exception("Supabase not initialized")
    return supabase


class LedgerRepository:

    @staticmethod
    def add_transaction(data: dict):
        return (
            supabase.table("financial_ledger")
            .insert(data)
            .execute()
        )

    @staticmethod
    def get_all_rewards():
        return (
            supabase.table("financial_ledger")
            .select("jumlah_tof")
            .execute()
        )

    @staticmethod
    def insert_blockchain_proof(data: dict):
        return (
            supabase.table("blockchain_proofs")
            .insert(data)
            .execute()
        )