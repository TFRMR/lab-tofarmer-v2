from pydantic import BaseModel

class UserResponse(BaseModel):
    id: str
    xp: int
    level: int
    rank: str