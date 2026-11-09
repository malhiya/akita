TODAY = "2026-10-19"
NY = "America/New_York"
WEEK = {"start": TODAY, "end": "2026-10-26"}


def ics(*events):
    body = "".join(
        f"BEGIN:VEVENT\r\nUID:{i}\r\nDTSTAMP:20261001T000000Z\r\n{e}\r\nEND:VEVENT\r\n"
        for i, e in enumerate(events)
    )
    return f"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\n{body}END:VCALENDAR\r\n"


DENTIST = "DTSTART:20261020T130000Z\r\nDTEND:20261020T140000Z\r\nSUMMARY:Secret dentist"
CLASS = "DTSTART:20261022T150000Z\r\nDTEND:20261022T163000Z\r\nSUMMARY:Class"


def make_owner(client, name="Alex"):
    return client.post("/owners", json={"name": name}).json()["id"]


def upload(client, owner, text, tz=NY):
    return client.post(f"/owners/{owner}/calendar", json={"ics": text, "tz": tz, "today": TODAY})


def test_upload_stores_busy_blocks_in_local_time(client):
    owner = make_owner(client)
    resp = upload(client, owner, ics(DENTIST, CLASS))
    assert resp.status_code == 200, resp.text
    assert resp.json()["blocks"] == 2

    busy = client.get(f"/owners/{owner}/busy", params=WEEK).json()
    assert busy == [
        {"start": "2026-10-20T09:00:00", "end": "2026-10-20T10:00:00"},
        {"start": "2026-10-22T11:00:00", "end": "2026-10-22T12:30:00"},
    ]


def test_busy_blocks_never_expose_titles(client):
    owner = make_owner(client)
    upload(client, owner, ics(DENTIST))
    text = client.get(f"/owners/{owner}/busy", params=WEEK).text
    assert "Secret" not in text and "dentist" not in text.lower()


def test_a_new_upload_replaces_the_old_calendar(client):
    owner = make_owner(client)
    upload(client, owner, ics(DENTIST))
    upload(client, owner, ics(CLASS))
    busy = client.get(f"/owners/{owner}/busy", params=WEEK).json()
    assert [b["start"] for b in busy] == ["2026-10-22T11:00:00"]


def test_a_bad_upload_is_rejected_and_keeps_the_old_calendar(client):
    owner = make_owner(client)
    upload(client, owner, ics(DENTIST))
    resp = upload(client, owner, "not a calendar")
    assert resp.status_code == 422 and "valid .ics" in resp.json()["detail"]
    assert len(client.get(f"/owners/{owner}/busy", params=WEEK).json()) == 1


def test_unknown_timezone_is_422(client):
    owner = make_owner(client)
    assert upload(client, owner, ics(DENTIST), tz="Mars/Olympus").status_code == 422


def test_missing_timezone_is_422(client):
    owner = make_owner(client)
    resp = client.post(f"/owners/{owner}/calendar", json={"ics": ics(DENTIST)})
    assert resp.status_code == 422


def test_upload_for_an_unknown_owner_is_404(client):
    assert upload(client, 999, ics(DENTIST)).status_code == 404


def test_busy_range_only_returns_blocks_in_range(client):
    owner = make_owner(client)
    upload(client, owner, ics(DENTIST, CLASS))
    busy = client.get(f"/owners/{owner}/busy", params={"start": "2026-10-21", "end": "2026-10-23"}).json()
    assert [b["start"] for b in busy] == ["2026-10-22T11:00:00"]


def test_one_owners_calendar_is_invisible_to_another(client):
    a, b = make_owner(client, "A"), make_owner(client, "B")
    upload(client, a, ics(DENTIST))
    assert client.get(f"/owners/{b}/busy", params=WEEK).json() == []


def test_clearing_the_calendar_removes_the_blocks(client):
    owner = make_owner(client)
    upload(client, owner, ics(DENTIST))
    assert client.delete(f"/owners/{owner}/calendar").status_code == 200
    assert client.get(f"/owners/{owner}/busy", params=WEEK).json() == []


def test_clearing_for_an_unknown_owner_is_404(client):
    assert client.delete("/owners/999/calendar").status_code == 404


def test_an_event_across_midnight_comes_back_as_two_pieces(client):
    owner = make_owner(client)
    late = "DTSTART:20261021T030000Z\r\nDTEND:20261021T060000Z\r\nSUMMARY:Night shift"  # 23:00 -> 02:00 New York
    upload(client, owner, ics(late))
    busy = client.get(f"/owners/{owner}/busy", params=WEEK).json()
    assert busy == [
        {"start": "2026-10-20T23:00:00", "end": "2026-10-21T00:00:00"},
        {"start": "2026-10-21T00:00:00", "end": "2026-10-21T02:00:00"},
    ]