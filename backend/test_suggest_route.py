import pytest

from main import app, get_ai_client

TODAY = "2026-10-09"
NEXT = "2026-10-10"


@pytest.fixture(autouse=True)
def no_ai(client):
    app.dependency_overrides[get_ai_client] = lambda: None
    yield
    app.dependency_overrides.pop(get_ai_client, None)


def make_owner(client):
    return client.post("/owners", json={"name": "Alex"}).json()["id"]


def make_pet(client, owner_id, name):
    return client.post(f"/owners/{owner_id}/pets", json={"name": name, "species": "Dog", "age": 3}).json()["id"]


def make_task(client, pet_id, name, category, priority, time):
    body = {
        "name": name, "category": category, "priority": priority, "duration_minutes": 30,
        "scheduled_time": time, "start_date": TODAY, "frequency": "once",
    }
    resp = client.post(f"/pets/{pet_id}/tasks", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_suggest_then_apply_resolves_the_conflict(client):
    owner = make_owner(client)
    walk = make_task(client, make_pet(client, owner, "Kat"), "walk", "walk", "high", "08:00")
    bath = make_task(client, make_pet(client, owner, "Max"), "bath", "grooming", "medium", "08:15")
    params = {"owner_id": owner, "start": TODAY, "end": NEXT}

    conflict = client.get("/conflicts", params=params).json()[0]
    resp = client.post("/conflicts/suggest", json={
        "owner_id": owner,
        "a_task_ids": conflict["a"]["task_ids"],
        "b_task_ids": conflict["b"]["task_ids"],
        "dates": conflict["dates"],
    })
    assert resp.status_code == 200, resp.text
    s = resp.json()
    assert s["move_task_ids"] == [bath] and s["new_time"] == "08:30" and s["source"] == "rule"

    patched = client.patch(f"/tasks/{bath}", json={"scheduled_time": s["new_time"]})
    assert patched.status_code == 200, patched.text
    assert client.get("/conflicts", params=params).json() == []


def test_suggest_for_a_conflict_that_no_longer_exists_is_404(client):
    owner = make_owner(client)
    resp = client.post("/conflicts/suggest", json={
        "owner_id": owner, "a_task_ids": [998], "b_task_ids": [999], "dates": [TODAY],
    })
    assert resp.status_code == 404


def test_suggest_needs_at_least_one_date(client):
    owner = make_owner(client)
    resp = client.post("/conflicts/suggest", json={
        "owner_id": owner, "a_task_ids": [1], "b_task_ids": [2], "dates": [],
    })
    assert resp.status_code == 422