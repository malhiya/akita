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

class Pet(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="owner.id")
    name: str
    species: str
    breed: str | None = Field(default=None)
    age: int
    weight: float | None = Field(default=None)
    health_notes: str | None = Field(default=None)


class PetCreate(SQLModel):
    name: str
    species: str
    breed: str | None = None
    age: int
    weight: float | None = None
    health_notes: str | None = None


class PetUpdate(SQLModel):
    name: str | None = None
    species: str | None = None
    breed: str | None = None
    age: int | None = None
    weight: float | None = None
    health_notes: str | None = None