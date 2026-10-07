from sqlmodel import select

from models import Task

def make_pet(client):
    owner = client.post("/owners", json={"name": "Alex"}).json()
    return client.post(
        f"/owners/{owner['id']}/pets",
        json={"name": "Buddy", "species": "Dog", "age": 3},
    ).json()


TASK = {
    "name": "Morning walk",
    "category": "walk",
    "priority": "high",
    "duration_minutes": 30,
    "scheduled_time": "08:00",
    "start_date": "2026-10-10",
    "frequency": "daily",
}


def test_daily_task_stores_rrule(client):
    pet = make_pet(client)
    response = client.post(f"/pets/{pet['id']}/tasks", json=TASK)
    assert response.status_code == 200
    assert response.json()["rrule"] == "RRULE:FREQ=DAILY"


def test_weekly_task_stores_rrule(client):
    pet = make_pet(client)
    body = {**TASK, "frequency": "weekly", "scheduled_day": "Saturday"}
    response = client.post(f"/pets/{pet['id']}/tasks", json=body)
    assert response.json()["rrule"] == "RRULE:FREQ=WEEKLY;BYDAY=SA"


def test_one_time_task_has_no_rrule(client):
    pet = make_pet(client)
    response = client.post(f"/pets/{pet['id']}/tasks", json={**TASK, "frequency": "once"})
    assert response.json()["rrule"] is None


def test_task_for_nonexistent_pet_returns_404(client):
    assert client.post("/pets/999/tasks", json=TASK).status_code == 404


def test_invalid_priority_returns_422(client):
    pet = make_pet(client)
    response = client.post(f"/pets/{pet['id']}/tasks", json={**TASK, "priority": "urgent"})
    assert response.status_code == 422


def test_list_and_delete_task(client):
    pet = make_pet(client)
    task = client.post(f"/pets/{pet['id']}/tasks", json=TASK).json()

    assert len(client.get(f"/pets/{pet['id']}/tasks").json()) == 1
    assert client.delete(f"/tasks/{task['id']}").status_code == 200
    assert client.get(f"/pets/{pet['id']}/tasks").json() == []

def test_list_owner_tasks_spans_pets_and_excludes_other_owners(client):
    owner_a = client.post("/owners", json={"name": "Alex"}).json()
    owner_b = client.post("/owners", json={"name": "Sam"}).json()
    pet1 = client.post(f"/owners/{owner_a['id']}/pets", json={"name": "Buddy", "species": "Dog", "age": 3}).json()
    pet2 = client.post(f"/owners/{owner_a['id']}/pets", json={"name": "Whiskers", "species": "Cat", "age": 5}).json()
    pet3 = client.post(f"/owners/{owner_b['id']}/pets", json={"name": "Rex", "species": "Dog", "age": 2}).json()

    for pet in (pet1, pet2, pet3):
        client.post(f"/pets/{pet['id']}/tasks", json=TASK)

    tasks = client.get(f"/owners/{owner_a['id']}/tasks").json()
    assert len(tasks) == 2


def test_deleting_pet_deletes_its_tasks(client, session):
    pet = make_pet(client)
    client.post(f"/pets/{pet['id']}/tasks", json=TASK)

    client.delete(f"/pets/{pet['id']}")

    assert session.exec(select(Task)).all() == []