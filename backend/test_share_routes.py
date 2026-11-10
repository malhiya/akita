from datetime import date, timedelta

from icalendar import Calendar

TODAY = date.today()


def day(offset=0):
    return (TODAY + timedelta(days=offset)).isoformat()


def make_owner(client, name="Alex"):
    resp = client.post("/owners", json={"name": name})
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def make_pet(client, owner, name="Kat"):
    resp = client.post(f"/owners/{owner}/pets", json={"name": name, "species": "Cat", "age": 3})
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def make_task(client, pet, name="walk", time="08:00", offset=0):
    resp = client.post(f"/pets/{pet}/tasks", json={
        "name": name, "category": "walk", "priority": "high", "duration_minutes": 30,
        "scheduled_time": time, "start_date": day(offset), "frequency": "once",
    })
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def share(client, owner):
    resp = client.post(f"/owners/{owner}/share")
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


def feed(client, token):
    resp = client.get(f"/share/{token}/calendar.ics")
    assert resp.status_code == 200, resp.text
    return resp


def summaries(resp):
    return [str(e["SUMMARY"]) for e in Calendar.from_ical(resp.text).walk("VEVENT")]


# ---------- creating, reading and revoking the link ----------

def test_a_new_owner_has_no_link_yet(client):
    owner = make_owner(client)
    resp = client.get(f"/owners/{owner}/share")
    assert resp.status_code == 200 and resp.json() == {"token": None}


def test_creating_a_link_returns_a_token_that_get_then_shows(client):
    owner = make_owner(client)
    token = share(client, owner)
    assert len(token) >= 20
    assert client.get(f"/owners/{owner}/share").json() == {"token": token}


def test_creating_twice_returns_the_same_link(client):
    owner = make_owner(client)
    assert share(client, owner) == share(client, owner)


def test_unknown_owner_cannot_have_a_link(client):
    assert client.post("/owners/999/share").status_code == 404
    assert client.get("/owners/999/share").status_code == 404


def test_revoking_deletes_the_link_and_kills_the_feed(client):
    owner = make_owner(client)
    token = share(client, owner)
    assert client.delete(f"/owners/{owner}/share").status_code == 204
    assert client.get(f"/owners/{owner}/share").json() == {"token": None}
    assert client.get(f"/share/{token}/calendar.ics").status_code == 404
    assert client.get(f"/share/{token}/schedule", params={"start": day(), "end": day(7)}).status_code == 404


def test_revoking_when_there_is_no_link_is_harmless(client):
    owner = make_owner(client)
    assert client.delete(f"/owners/{owner}/share").status_code == 204


def test_a_new_link_after_revoking_is_a_different_one(client):
    owner = make_owner(client)
    old = share(client, owner)
    client.delete(f"/owners/{owner}/share")
    assert share(client, owner) != old


def test_unknown_token_is_a_404_everywhere(client):
    assert client.get("/share/nope/calendar.ics").status_code == 404
    assert client.get("/share/nope/schedule", params={"start": day(), "end": day(7)}).status_code == 404


# ---------- the read-only schedule ----------

def test_shared_schedule_shows_only_that_owners_tasks(client):
    a, b = make_owner(client, "Alex"), make_owner(client, "Sam")
    make_task(client, make_pet(client, a, "Kat"), "walk")
    make_task(client, make_pet(client, b, "Rex"), "bath", time="09:00")
    token = share(client, a)
    out = client.get(f"/share/{token}/schedule", params={"start": day(), "end": day(7)}).json()
    assert [(o["pet_name"], o["name"]) for o in out] == [("Kat", "walk")]


def test_shared_schedule_merges_linked_pets(client):
    owner = make_owner(client)
    t1 = make_task(client, make_pet(client, owner, "Kat"))
    t2 = make_task(client, make_pet(client, owner, "Max"))
    assert client.post("/tasks/link", json={"task_ids": [t1, t2]}).status_code == 200
    token = share(client, owner)
    out = client.get(f"/share/{token}/schedule", params={"start": day(), "end": day(7)}).json()
    assert len(out) == 1 and out[0]["pet_names"] == ["Kat", "Max"]


def test_shared_schedule_rejects_a_backwards_range(client):
    token = share(client, make_owner(client))
    resp = client.get(f"/share/{token}/schedule", params={"start": day(7), "end": day()})
    assert resp.status_code == 422


# ---------- the .ics feed ----------

def test_feed_is_served_as_a_calendar(client):
    token = share(client, make_owner(client))
    resp = feed(client, token)
    assert resp.headers["content-type"].startswith("text/calendar")
    assert resp.text.startswith("BEGIN:VCALENDAR")


def test_feed_lists_the_owners_tasks_and_is_named_after_them(client):
    owner = make_owner(client, "Alex")
    pet = make_pet(client, owner, "Kat")
    make_task(client, pet, "walk", time="08:00", offset=0)
    make_task(client, pet, "feed", time="18:00", offset=1)
    resp = feed(client, share(client, owner))
    assert summaries(resp) == ["Kat: walk", "Kat: feed"]
    assert str(Calendar.from_ical(resp.text)["X-WR-CALNAME"]) == "Alex's pet schedule"


def test_feed_shows_linked_pets_as_one_event(client):
    owner = make_owner(client)
    t1 = make_task(client, make_pet(client, owner, "Kat"), "walk Kat")
    t2 = make_task(client, make_pet(client, owner, "Max"), "walk Max")
    client.post("/tasks/link", json={"task_ids": [t1, t2]})
    assert summaries(feed(client, share(client, owner))) == ["Kat & Max: walk"]


def test_feed_never_includes_another_owners_tasks(client):
    a, b = make_owner(client, "Alex"), make_owner(client, "Sam")
    make_task(client, make_pet(client, a, "Kat"), "walk")
    make_task(client, make_pet(client, b, "Rex"), "bath", time="09:00")
    assert summaries(feed(client, share(client, a))) == ["Kat: walk"]


def test_feed_covers_last_week_to_four_months_ahead(client):
    owner = make_owner(client)
    pet = make_pet(client, owner)
    make_task(client, pet, "recent", offset=-3)
    make_task(client, pet, "soon", offset=10)
    make_task(client, pet, "ancient", offset=-30)
    make_task(client, pet, "far", offset=200)
    assert summaries(feed(client, share(client, owner))) == ["Kat: recent", "Kat: soon"]


def test_an_uploaded_calendar_never_leaks_into_the_feed(client):
    owner = make_owner(client)
    make_task(client, make_pet(client, owner), "walk")
    tomorrow = (TODAY + timedelta(days=1)).strftime("%Y%m%d")
    ics = (
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\n"
        "BEGIN:VEVENT\r\nUID:1\r\nDTSTAMP:20261001T000000Z\r\n"
        f"DTSTART:{tomorrow}T131500Z\r\nDTEND:{tomorrow}T140000Z\r\nSUMMARY:Secret meeting\r\n"
        "END:VEVENT\r\nEND:VCALENDAR\r\n"
    )
    resp = client.post(f"/owners/{owner}/calendar", json={
        "ics": ics, "tz": "America/New_York", "today": TODAY.isoformat(),
    })
    assert resp.status_code == 200, resp.text
    out = feed(client, share(client, owner))
    assert summaries(out) == ["Kat: walk"]
    assert "Secret" not in out.text and "meeting" not in out.text.lower()