import pytest

from main import app, get_ai_client

TODAY = "2026-10-09"
NEXT = "2026-10-10"


@pytest.fixture(autouse=True)
def no_ai(client):
    app.dependency_overrides[get_ai_client] = lambda: None
    yield
    app.dependency_overrides.pop(get_ai_client, None)


def make_owner(client, name="Alex"):
    return client.post("/owners", json={"name": name}).json()["id"]


def make_pet(client, owner_id, name):
    return client.post(f"/owners/{owner_id}/pets", json={"name": name, "species": "Dog", "age": 3}).json()["id"]


def make_task(client, pet_id, name="walk", time="08:00"):
    body = {
        "name": name, "category": "walk", "priority": "high", "duration_minutes": 30,
        "scheduled_time": time, "start_date": TODAY, "frequency": "once",
    }
    resp = client.post(f"/pets/{pet_id}/tasks", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_linking_two_tasks_merges_them_on_the_calendar(client):
    owner = make_owner(client)
    a = make_task(client, make_pet(client, owner, "Kat"))
    b = make_task(client, make_pet(client, owner, "Max"))

    resp = client.post("/tasks/link", json={"task_ids": [a, b]})
    assert resp.status_code == 200, resp.text
    assert resp.json()["task_ids"] == [a, b]

    events = client.get("/schedule", params={"owner_id": owner, "start": TODAY, "end": NEXT}).json()
    assert len(events) == 1 and events[0]["pet_names"] == ["Kat", "Max"]


def test_linking_into_an_existing_group_brings_the_whole_group(client):
    owner = make_owner(client)
    a = make_task(client, make_pet(client, owner, "Kat"))
    b = make_task(client, make_pet(client, owner, "Max"))
    c = make_task(client, make_pet(client, owner, "Luna"))
    first = client.post("/tasks/link", json={"task_ids": [a, b]}).json()["group_id"]

    resp = client.post("/tasks/link", json={"task_ids": [b, c]}).json()
    assert resp["group_id"] == first
    assert resp["task_ids"] == [a, b, c]
    assert {client.get(f"/tasks/{i}").json()["group_id"] for i in (a, b, c)} == {first}


def test_link_unknown_task_is_404(client):
    owner = make_owner(client)
    a = make_task(client, make_pet(client, owner, "Kat"))
    assert client.post("/tasks/link", json={"task_ids": [a, 999]}).status_code == 404


def test_link_across_owners_is_rejected(client):
    a = make_task(client, make_pet(client, make_owner(client, "A"), "Kat"))
    b = make_task(client, make_pet(client, make_owner(client, "B"), "Max"))
    assert client.post("/tasks/link", json={"task_ids": [a, b]}).status_code == 422


def test_link_needs_two_different_tasks(client):
    owner = make_owner(client)
    a = make_task(client, make_pet(client, owner, "Kat"))
    assert client.post("/tasks/link", json={"task_ids": [a]}).status_code == 422
    assert client.post("/tasks/link", json={"task_ids": [a, a]}).status_code == 422


def test_conflicts_route_flags_identical_tasks_until_they_are_linked(client):
    owner = make_owner(client)
    a = make_task(client, make_pet(client, owner, "Kat"))
    b = make_task(client, make_pet(client, owner, "Max"))
    params = {"owner_id": owner, "start": TODAY, "end": NEXT}

    found = client.get("/conflicts", params=params).json()
    assert len(found) == 1 and found[0]["kind"] == "identical"
    assert sorted(found[0]["a"]["task_ids"] + found[0]["b"]["task_ids"]) == [a, b]

    client.post("/tasks/link", json={"task_ids": [a, b]})
    assert client.get("/conflicts", params=params).json() == []