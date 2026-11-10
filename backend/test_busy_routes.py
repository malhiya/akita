import pytest

from main import app, get_ai_client

TODAY = "2026-10-09"
NEXT = "2026-10-10"
NY = "America/New_York"
# Oct 9 2026 is daylight time (UTC-4): 13:15Z-14:00Z is 09:15-10:00 in New York.
MEETING = ("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\n"
           "BEGIN:VEVENT\r\nUID:1\r\nDTSTAMP:20261001T000000Z\r\n"
           "DTSTART:20261009T131500Z\r\nDTEND:20261009T140000Z\r\nSUMMARY:Secret meeting\r\n"
           "END:VEVENT\r\nEND:VCALENDAR\r\n")
PARAMS = {"start": TODAY, "end": NEXT}


@pytest.fixture(autouse=True)
def no_ai(client):
    app.dependency_overrides[get_ai_client] = lambda: None
    yield
    app.dependency_overrides.pop(get_ai_client, None)


def make_owner(client, name="Alex"):
    return client.post("/owners", json={"name": name}).json()["id"]


def make_task(client, owner, time="09:00", priority="high"):
    pet = client.post(f"/owners/{owner}/pets", json={"name": "Kat", "species": "Cat", "age": 3}).json()["id"]
    resp = client.post(f"/pets/{pet}/tasks", json={
        "name": "walk", "category": "walk", "priority": priority, "duration_minutes": 30,
        "scheduled_time": time, "start_date": TODAY, "frequency": "once",
    })
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def upload(client, owner, text=MEETING):
    resp = client.post(f"/owners/{owner}/calendar", json={"ics": text, "tz": NY, "today": TODAY})
    assert resp.status_code == 200, resp.text


def test_a_pet_task_overlapping_the_calendar_is_reported(client):
    owner = make_owner(client)
    task = make_task(client, owner)
    upload(client, owner)
    resp = client.get("/conflicts", params={"owner_id": owner, **PARAMS})
    found = resp.json()
    assert len(found) == 1
    assert found[0]["kind"] == "busy" and found[0]["overlap_minutes"] == 15
    assert found[0]["a"]["task_ids"] == [task] and found[0]["b"]["task_ids"] == []
    assert "Secret" not in resp.text


def test_a_clear_task_is_not_reported(client):
    owner = make_owner(client)
    make_task(client, owner, time="11:00")
    upload(client, owner)
    assert client.get("/conflicts", params={"owner_id": owner, **PARAMS}).json() == []


def test_suggest_and_apply_moves_the_task_off_the_calendar(client):
    owner = make_owner(client)
    task = make_task(client, owner)
    upload(client, owner)
    conflict = client.get("/conflicts", params={"owner_id": owner, **PARAMS}).json()[0]

    resp = client.post("/conflicts/suggest", json={
        "owner_id": owner, "a_task_ids": conflict["a"]["task_ids"],
        "b_task_ids": conflict["b"]["task_ids"], "dates": conflict["dates"],
    })
    assert resp.status_code == 200, resp.text
    s = resp.json()
    assert s["move_task_ids"] == [task] and s["new_time"] == "08:45"

    assert client.patch(f"/tasks/{task}", json={"scheduled_time": s["new_time"]}).status_code == 200
    assert client.get("/conflicts", params={"owner_id": owner, **PARAMS}).json() == []


def test_suggesting_after_the_calendar_is_removed_is_404(client):
    owner = make_owner(client)
    task = make_task(client, owner)
    upload(client, owner)
    conflict = client.get("/conflicts", params={"owner_id": owner, **PARAMS}).json()[0]
    client.delete(f"/owners/{owner}/calendar")
    resp = client.post("/conflicts/suggest", json={
        "owner_id": owner, "a_task_ids": [task], "b_task_ids": [], "dates": conflict["dates"],
    })
    assert resp.status_code == 404


def test_another_owners_calendar_does_not_create_conflicts(client):
    a, b = make_owner(client, "A"), make_owner(client, "B")
    make_task(client, a)
    upload(client, b)
    assert client.get("/conflicts", params={"owner_id": a, **PARAMS}).json() == []


def test_removing_the_calendar_clears_its_conflicts(client):
    owner = make_owner(client)
    make_task(client, owner)
    upload(client, owner)
    client.delete(f"/owners/{owner}/calendar")
    assert client.get("/conflicts", params={"owner_id": owner, **PARAMS}).json() == []