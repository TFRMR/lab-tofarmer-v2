import time

GLOBAL_STATE = {
    "last_action": {}
}

def anti_spam(user_id: str, seconds: int = 3):
    now = time.time()
    last = GLOBAL_STATE["last_action"].get(user_id, 0)

    if now - last < seconds:
        return False

    GLOBAL_STATE["last_action"][user_id] = now
    return True