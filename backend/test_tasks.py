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


def schedule(client, owner_id, start, end, **extra):
    return client.get("/schedule", params={"owner_id": owner_id, "start": start, "end": end, **extra})


def test_schedule_expands_daily_task(client):
    pet = make_pet(client)
    client.post(f"/pets/{pet['id']}/tasks", json=TASK)
    response = schedule(client, pet["owner_id"], "2026-10-10", "2026-10-16")
    assert response.status_code == 200
    assert len(response.json()) == 7


def test_schedule_pet_filter(client):
    pet1 = make_pet(client)
    pet2 = client.post(
        f"/owners/{pet1['owner_id']}/pets",
        json={"name": "Whiskers", "species": "Cat", "age": 5},
    ).json()
    client.post(f"/pets/{pet1['id']}/tasks", json=TASK)
    client.post(f"/pets/{pet2['id']}/tasks", json=TASK)

    both = schedule(client, pet1["owner_id"], "2026-10-10", "2026-10-10").json()
    only_one = schedule(client, pet1["owner_id"], "2026-10-10", "2026-10-10", pet_id=pet2["id"]).json()
    assert len(both) == 2
    assert [o["pet_name"] for o in only_one] == ["Whiskers"]


def test_schedule_excludes_other_owners(client):
    pet = make_pet(client)
    client.post(f"/pets/{pet['id']}/tasks", json=TASK)
    other = client.post("/owners", json={"name": "Sam"}).json()
    assert schedule(client, other["id"], "2026-10-10", "2026-10-16").json() == []


def test_schedule_rejects_reversed_range(client):
    assert schedule(client, 1, "2026-10-16", "2026-10-10").status_code == 422


def test_schedule_rejects_huge_range(client):
    assert schedule(client, 1, "2026-01-01", "2028-01-01").status_code == 422


def new_task(client, **overrides):
    pet = make_pet(client)
    return client.post(f"/pets/{pet['id']}/tasks", json={**TASK, **overrides}).json()


def test_get_task_includes_frequency_and_day(client):
    task = new_task(client, frequency="weekly", scheduled_day="Saturday")
    data = client.get(f"/tasks/{task['id']}").json()
    assert data["frequency"] == "weekly"
    assert data["scheduled_day"] == "Saturday"
    assert data["rrule"] == "RRULE:FREQ=WEEKLY;BYDAY=SA"


def test_get_missing_task_returns_404(client):
    assert client.get("/tasks/999").status_code == 404


def test_patch_time_only(client):
    task = new_task(client)
    r = client.patch(f"/tasks/{task['id']}", json={"scheduled_time": "09:30"})
    assert r.status_code == 200
    data = r.json()
    assert data["scheduled_time"] == "09:30"
    assert data["name"] == "Morning walk"
    assert data["rrule"] == "RRULE:FREQ=DAILY"


def test_patch_weekly_day_rebuilds_rrule(client):
    task = new_task(client, frequency="weekly", scheduled_day="Saturday")
    r = client.patch(f"/tasks/{task['id']}", json={"scheduled_day": "Sunday"})
    assert r.json()["rrule"] == "RRULE:FREQ=WEEKLY;BYDAY=SU"
    assert r.json()["scheduled_day"] == "Sunday"


def test_patch_daily_to_weekly_needs_a_day(client):
    task = new_task(client)
    assert client.patch(f"/tasks/{task['id']}", json={"frequency": "weekly"}).status_code == 422


def test_patch_weekly_to_once_clears_rrule(client):
    task = new_task(client, frequency="weekly", scheduled_day="Saturday")
    r = client.patch(f"/tasks/{task['id']}", json={"frequency": "once"})
    assert r.json()["rrule"] is None
    assert r.json()["frequency"] == "once"


def test_patch_changes_start_date(client):
    task = new_task(client, frequency="once")
    r = client.patch(f"/tasks/{task['id']}", json={"start_date": "2026-10-15"})
    assert r.json()["start_date"] == "2026-10-15"


def test_patch_bad_time_returns_422(client):
    task = new_task(client)
    assert client.patch(f"/tasks/{task['id']}", json={"scheduled_time": "25:00"}).status_code == 422


def test_patch_end_before_start_returns_422(client):
    task = new_task(client)
    assert client.patch(f"/tasks/{task['id']}", json={"end_date": "2026-01-01"}).status_code == 422


def test_patch_can_clear_end_date(client):
    task = new_task(client, end_date="2026-12-31")
    r = client.patch(f"/tasks/{task['id']}", json={"end_date": None})
    assert r.status_code == 200
    assert r.json()["end_date"] is None


def test_patch_null_required_field_returns_422(client):
    task = new_task(client)
    assert client.patch(f"/tasks/{task['id']}", json={"start_date": None}).status_code == 422


def test_patch_missing_task_returns_404(client):
    assert client.patch("/tasks/999", json={"name": "x"}).status_code == 404