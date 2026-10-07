from datetime import date, datetime
from typing import Literal

from pydantic import field_validator, model_validator
from sqlmodel import SQLModel, Field

Category = Literal["meds", "vet", "feeding", "walk", "grooming", "play", "training", "general"]
Priority = Literal["non-negotiable", "high", "medium", "low"]
Frequency = Literal["once", "daily", "weekly"]


class Task(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    pet_id: int = Field(foreign_key="pet.id")
    name: str
    category: str
    priority: str
    duration_minutes: int
    scheduled_time: str
    start_date: date
    end_date: date | None = Field(default=None)
    rrule: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TaskCreate(SQLModel):
    name: str
    category: Category
    priority: Priority
    duration_minutes: int = Field(ge=1, le=240)
    scheduled_time: str
    start_date: date
    end_date: date | None = None
    frequency: Frequency
    scheduled_day: str | None = None

    @field_validator("scheduled_time")
    @classmethod
    def check_time(cls, v):
        hh, _, mm = v.partition(":")
        if not (len(v) == 5 and hh.isdigit() and mm.isdigit()
                and int(hh) <= 23 and int(mm) <= 59):
            raise ValueError("scheduled_time must be 24-hour HH:MM, like 08:30")
        return v

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")
        return self

    @model_validator(mode="after")
    def check_weekly_has_day(self):
        if self.frequency == "weekly" and not self.scheduled_day:
            raise ValueError("scheduled_day is required when frequency is weekly")
        return self

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

class Occurrence(SQLModel):
    task_id: int
    pet_id: int
    pet_name: str
    name: str
    category: str
    priority: str
    occurs_on: date
    time: str
    duration_minutes: int