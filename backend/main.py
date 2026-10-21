import logging
import uuid
from datetime import date
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel, Session, col, create_engine, select
from suggestions import Suggestion, SuggestRequest, suggest_fix
from conflicts import detect_conflicts
from group_merge import merge_grouped
from groq_client import get_client
from models import (
    Conflict,
    LinkRequest,
    LinkResponse,
    Occurrence,
    Owner,
    OwnerCreate,
    Pet,
    PetCreate,
    PetUpdate,
    Task,
    TaskCreate,
    TaskRead,
    TaskUpdate,
)
from parse_service import ParseRequest, ParseResponse, parse_lines
from recurrence import build_rrule, expand_occurrences, parse_rrule

logger = logging.getLogger(__name__)

DATABASE_URL = "sqlite:///akita.db"
engine = create_engine(DATABASE_URL)


def get_session():
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


def get_ai_client():
    """None means 'no AI': a missing key or any setup failure falls back to keywords."""
    try:
        return get_client()
    except Exception as e:
        logger.warning("Groq client unavailable, using keyword fallback: %s", e)
        return None


AiClientDep = Annotated[Any, Depends(get_ai_client)]

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)


@app.get("/")
def read_root():
    return {"status": "ok"}


@app.post("/owners", response_model=Owner)
def create_owner(owner_in: OwnerCreate, session: SessionDep):
    owner = Owner(name=owner_in.name)
    session.add(owner)
    session.commit()
    session.refresh(owner)
    return owner


@app.get("/owners/{owner_id}", response_model=Owner)
def get_owner(owner_id: int, session: SessionDep):
    owner = session.get(Owner, owner_id)
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    return owner


@app.post("/owners/{owner_id}/pets", response_model=Pet)
def create_pet(owner_id: int, pet_in: PetCreate, session: SessionDep):
    owner = session.get(Owner, owner_id)
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    pet = Pet(**pet_in.model_dump(), owner_id=owner_id)
    session.add(pet)
    session.commit()
    session.refresh(pet)
    return pet


@app.get("/owners/{owner_id}/pets", response_model=list[Pet])
def list_pets(owner_id: int, session: SessionDep):
    pets = session.exec(select(Pet).where(Pet.owner_id == owner_id)).all()
    return pets


@app.patch("/pets/{pet_id}", response_model=Pet)
def update_pet(pet_id: int, pet_in: PetUpdate, session: SessionDep):
    pet = session.get(Pet, pet_id)
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    update_data = pet_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(pet, key, value)
    session.add(pet)
    session.commit()
    session.refresh(pet)
    return pet


@app.delete("/pets/{pet_id}")
def delete_pet(pet_id: int, session: SessionDep):
    pet = session.get(Pet, pet_id)
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")

    for task in session.exec(select(Task).where(Task.pet_id == pet_id)).all():
        session.delete(task)

    session.delete(pet)
    session.commit()
    return {"ok": True}

@app.post("/pets/{pet_id}/tasks", response_model=Task)
def create_task(pet_id: int, task_in: TaskCreate, session: SessionDep):
    pet = session.get(Pet, pet_id)
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")

    rrule = build_rrule(task_in.frequency, task_in.scheduled_day)
    data = task_in.model_dump(exclude={"frequency", "scheduled_day"})
    task = Task(**data, pet_id=pet_id, rrule=rrule)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@app.get("/pets/{pet_id}/tasks", response_model=list[Task])
def list_tasks(pet_id: int, session: SessionDep):
    return session.exec(select(Task).where(Task.pet_id == pet_id)).all()


@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, session: SessionDep):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    session.delete(task)
    session.commit()
    return {"ok": True}

@app.get("/owners/{owner_id}/tasks", response_model=list[Task])
def list_owner_tasks(owner_id: int, session: SessionDep):
    return session.exec(
        select(Task).join(Pet).where(Pet.owner_id == owner_id)
    ).all()


def check_range(start: date, end: date) -> None:
    if end < start:
        raise HTTPException(status_code=422, detail="end must not be before start")
    if (end - start).days > 366:
        raise HTTPException(status_code=422, detail="range cannot exceed one year")


def collect_occurrences(
    session: Session, owner_id: int, start: date, end: date, pet_id: int | None = None
) -> tuple[list[Occurrence], dict[int, Task]]:
    """Every occurrence in the range, one per task (NOT merged), plus the tasks by id."""
    query = select(Task, Pet).where(Task.pet_id == Pet.id, Pet.owner_id == owner_id)
    if pet_id is not None:
        query = query.where(Pet.id == pet_id)

    occurrences: list[Occurrence] = []
    tasks: dict[int, Task] = {}
    for task, pet in session.exec(query).all():
        tasks[task.id] = task
        for day in expand_occurrences(task.rrule, task.start_date, task.end_date, start, end):
            occurrences.append(Occurrence(
                task_id=task.id, pet_id=pet.id, pet_name=pet.name, name=task.name,
                category=task.category, priority=task.priority, occurs_on=day,
                time=task.scheduled_time, duration_minutes=task.duration_minutes,
                group_id=task.group_id,
            ))
    return sorted(occurrences, key=lambda o: (o.occurs_on, o.time)), tasks


@app.get("/schedule", response_model=list[Occurrence])
def get_schedule(
    owner_id: int,
    start: date,
    end: date,
    session: SessionDep,
    pet_id: int | None = None,
):
    check_range(start, end)
    occurrences, _ = collect_occurrences(session, owner_id, start, end, pet_id)
    return merge_grouped(occurrences)


@app.get("/conflicts", response_model=list[Conflict])
def get_conflicts(owner_id: int, start: date, end: date, session: SessionDep):
    check_range(start, end)
    occurrences, tasks = collect_occurrences(session, owner_id, start, end)
    return detect_conflicts(merge_grouped(occurrences), tasks)

@app.post("/conflicts/suggest", response_model=Suggestion)
def suggest_conflict_fix(req: SuggestRequest, session: SessionDep, client: AiClientDep):
    if not req.dates:
        raise HTTPException(status_code=422, detail="dates cannot be empty")
    first, last = min(req.dates), max(req.dates)
    check_range(first, last)

    occurrences, _ = collect_occurrences(session, req.owner_id, first, last)
    wanted = set(req.dates)
    on_those_days = [o for o in occurrences if o.occurs_on in wanted]
    merged = merge_grouped([o for o in occurrences if o.occurs_on == first])

    def find(ids: list[int]):
        return next((m for m in merged if set(m.task_ids) == set(ids)), None)

    a, b = find(req.a_task_ids), find(req.b_task_ids)
    if a is None or b is None:
        raise HTTPException(status_code=404, detail="That conflict no longer exists")
    return suggest_fix(client, a, b, on_those_days)


@app.post("/tasks/link", response_model=LinkResponse)
def link_tasks(req: LinkRequest, session: SessionDep):
    """Give several tasks one shared group_id so they show as one calendar event."""
    ids = list(dict.fromkeys(req.task_ids))
    if len(ids) < 2:
        raise HTTPException(status_code=422, detail="need at least two different tasks to link")

    tasks = [session.get(Task, i) for i in ids]
    if any(t is None for t in tasks):
        raise HTTPException(status_code=404, detail="Task not found")

    owners = {session.get(Pet, t.pet_id).owner_id for t in tasks}
    if len(owners) != 1:
        raise HTTPException(status_code=422, detail="tasks belong to different owners")

    existing = sorted({t.group_id for t in tasks if t.group_id})
    group_id = existing[0] if existing else uuid.uuid4().hex

    to_update = {t.id: t for t in tasks}
    if existing:  # joining groups: everyone already in them comes along
        for t in session.exec(select(Task).where(col(Task.group_id).in_(existing))).all():
            to_update[t.id] = t

    for t in to_update.values():
        t.group_id = group_id
        session.add(t)
    session.commit()
    return LinkResponse(group_id=group_id, task_ids=sorted(to_update))


REQUIRED_ON_PATCH = ("name", "category", "priority", "duration_minutes", "scheduled_time", "start_date")


def to_read(task: Task) -> TaskRead:
    return TaskRead(**task.model_dump(), **parse_rrule(task.rrule))


@app.get("/tasks/{task_id}", response_model=TaskRead)
def get_task(task_id: int, session: SessionDep):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return to_read(task)


@app.patch("/tasks/{task_id}", response_model=TaskRead)
def update_task(task_id: int, task_in: TaskUpdate, session: SessionDep):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    changes = task_in.model_dump(exclude_unset=True)
    frequency = changes.pop("frequency", None)
    scheduled_day = changes.pop("scheduled_day", None)

    # 1. Validate everything before touching the task
    for field in REQUIRED_ON_PATCH:
        if field in changes and changes[field] is None:
            raise HTTPException(status_code=422, detail=f"{field} cannot be empty")

    new_start = changes.get("start_date", task.start_date)
    new_end = changes["end_date"] if "end_date" in changes else task.end_date
    if new_end and new_end < new_start:
        raise HTTPException(status_code=422, detail="end_date cannot be before start_date")

    new_rrule = task.rrule
    if frequency is not None or scheduled_day is not None:
        current = parse_rrule(task.rrule)
        try:
            new_rrule = build_rrule(
                frequency or current["frequency"],
                scheduled_day or current["scheduled_day"],
            )
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))

    # 2. Apply
    for field, value in changes.items():
        setattr(task, field, value)
    task.rrule = new_rrule

    session.add(task)
    session.commit()
    session.refresh(task)
    return to_read(task)


@app.post("/parse", response_model=ParseResponse)
def parse_tasks(req: ParseRequest, session: SessionDep, client: AiClientDep):
    if not session.get(Owner, req.owner_id):
        raise HTTPException(status_code=404, detail="Owner not found")
    pets = session.exec(select(Pet).where(Pet.owner_id == req.owner_id)).all()
    if req.pet_id is not None and req.pet_id not in {p.id for p in pets}:
        raise HTTPException(status_code=404, detail="Pet not found")
    return parse_lines(client, pets, req.text, req.pet_id, req.today or date.today())