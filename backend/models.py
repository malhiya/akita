from datetime import datetime
from sqlmodel import SQLModel, Field

class Owner(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int | None = Field(default=None)
    name: str
    available_minutes: int | None = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class OwnerCreate(SQLModel):
    name: str