from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel, Session, create_engine
from models import Owner, OwnerCreate

DATABASE_URL = "sqlite:///akita.db"
engine = create_engine(DATABASE_URL)

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
def create_owner(owner_in: OwnerCreate):
    owner = Owner(name=owner_in.name)
    with Session(engine) as session:
        session.add(owner)
        session.commit()
        session.refresh(owner)
        return owner

@app.get("/owners/{owner_id}", response_model=Owner)
def get_owner(owner_id: int):
    with Session(engine) as session:
        owner = session.get(Owner, owner_id)
        if not owner:
            raise HTTPException(status_code=404, detail="Owner not found")
        return owner