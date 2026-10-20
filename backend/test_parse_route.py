import pytest

from main import app, get_ai_client

TODAY = "2026-10-09"


@pytest.fixture(autouse=True)
def no_ai(client):
    """Route tests never call Groq."""
    app.dependency_overrides[get_ai_client] = lambda: None
    yield
    app.dependency_overrides.pop(get_ai_client, None)


def make_owner(client, name="Alex"):
    resp = client.post("/owners", json={"name": name})
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def make_pet(client, owner_id, name, species="Dog", age=3):
    resp = client.post(f"/owners/{owner_id}/pets", json={"name": name, "species": species, "age": age})
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_parse_returns_drafts_and_saves_nothing(client):
    owner_id = make_owner(client)
    pet_id = make_pet(client, owner_id, "Luna")
    resp = client.post("/parse", json={
        "owner_id": owner_id,
        "text": "give Luna her medication at 8am\nwalk Luna every morning",
        "today": TODAY,
    })
    assert resp.status_code == 200
    drafts = resp.json()["drafts"]
    assert len(drafts) == 2 and all(d["pet_id"] == pet_id for d in drafts)
    assert client.get(f"/owners/{owner_id}/tasks").json() == []


def test_parse_unknown_owner_is_404(client):
    assert client.post("/parse", json={"owner_id": 999, "text": "walk Max"}).status_code == 404


def test_parse_rejects_a_pet_from_another_owner(client):
    owner_a = make_owner(client, "A")
    owner_b = make_owner(client, "B")
    pet_b = make_pet(client, owner_b, "Rex")
    resp = client.post("/parse", json={"owner_id": owner_a, "pet_id": pet_b, "text": "walk Rex"})
    assert resp.status_code == 404


def test_parse_rejects_oversized_text(client):
    owner_id = make_owner(client)
    resp = client.post("/parse", json={"owner_id": owner_id, "text": "walk Max\n" * 300})
    assert resp.status_code == 422


def test_a_draft_can_be_saved_through_the_existing_task_route(client):
    owner_id = make_owner(client)
    make_pet(client, owner_id, "Luna")
    resp = client.post("/parse", json={
        "owner_id": owner_id,
        "text": "give Luna her medication at 8am every Saturday",
        "today": TODAY,
    })
    draft = resp.json()["drafts"][0]
    fields = ("name", "category", "priority", "duration_minutes",
              "scheduled_time", "start_date", "frequency", "scheduled_day")
    saved = client.post(f"/pets/{draft['pet_id']}/tasks", json={k: draft[k] for k in fields})
    assert saved.status_code == 200, saved.text


def test_split_line_drafts_save_with_a_shared_group_id(client):
    owner_id = make_owner(client)
    make_pet(client, owner_id, "Luna")
    make_pet(client, owner_id, "Max")
    resp = client.post("/parse", json={
        "owner_id": owner_id, "text": "walk Luna and Max every morning", "today": TODAY,
    })
    drafts = resp.json()["drafts"]
    assert len(drafts) == 2
    assert drafts[0]["group_id"] and drafts[0]["group_id"] == drafts[1]["group_id"]

    fields = ("name", "category", "priority", "duration_minutes", "scheduled_time",
              "start_date", "frequency", "scheduled_day", "group_id")
    ids = []
    for d in drafts:
        saved = client.post(f"/pets/{d['pet_id']}/tasks", json={k: d[k] for k in fields})
        assert saved.status_code == 200, saved.text
        ids.append(saved.json()["id"])

    groups = {client.get(f"/tasks/{i}").json()["group_id"] for i in ids}
    assert groups == {drafts[0]["group_id"]}

def test_schedule_merges_grouped_tasks_into_one_event(client):
    owner_id = make_owner(client)
    luna = make_pet(client, owner_id, "Luna")
    max_id = make_pet(client, owner_id, "Max")
    body = {
        "name": "walk", "category": "walk", "priority": "high",
        "duration_minutes": 30, "scheduled_time": "08:00",
        "start_date": TODAY, "frequency": "once", "group_id": "g1",
    }
    for pet_id in (luna, max_id):
        resp = client.post(f"/pets/{pet_id}/tasks", json=body)
        assert resp.status_code == 200, resp.text

    # an unrelated, ungrouped task at the same time must stay separate
    solo = {**body, "name": "brush teeth", "group_id": None}
    resp = client.post(f"/pets/{luna}/tasks", json=solo)
    assert resp.status_code == 200, resp.text

    resp = client.get("/schedule", params={"owner_id": owner_id, "start": TODAY, "end": "2026-10-10"})
    assert resp.status_code == 200
    events = resp.json()
    assert len(events) == 2

    walk = next(e for e in events if e["name"] == "walk")
    assert walk["pet_names"] == ["Luna", "Max"]
    assert walk["pet_name"] == "Luna & Max"
    assert len(walk["task_ids"]) == 2

    # filtering to one pet shows just that pet's half
    one = client.get("/schedule", params={
        "owner_id": owner_id, "start": TODAY, "end": "2026-10-10", "pet_id": max_id,
    }).json()
    walk_one = next(e for e in one if e["name"] == "walk")
    assert walk_one["pet_names"] == ["Max"]