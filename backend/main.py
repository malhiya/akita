from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel, Session, create_engine, select

from models import Owner, OwnerCreate, Pet, PetCreate, PetUpdate

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
    if  owner:
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