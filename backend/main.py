from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel, Session, create_engine, select

from models import Owner, OwnerCreate, Pet, PetCreate, PetUpdate, Task, TaskCreate
from recurrence import build_rrule

DATABASE_URL = "sqlite:///akita.db"
engine = create_engine(DATABASE_URL)


def get_session():
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]

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