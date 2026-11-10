from datetime import date, datetime, timedelta, timezone

from icalendar import Calendar

from group_merge import merge_grouped
from ics_feed import build_feed, event_uid
from models import Occurrence

D = date(2026, 10, 21)
NOW = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)


def occ(task_id, pet, name="walk", time="08:00", dur=30, priority="high",
        category="walk", group_id=None, day=D):
    return Occurrence(
        task_id=task_id, pet_id=task_id, pet_name=pet, name=name, category=category,
        priority=priority, occurs_on=day, time=time, duration_minutes=dur,
        group_id=group_id, pet_names=[pet], task_ids=[task_id],
    )


def events(text):
    return list(Calendar.from_ical(text).walk("VEVENT"))


def test_an_empty_schedule_is_still_a_valid_calendar():
    cal = Calendar.from_ical(build_feed([], now=NOW))
    assert list(cal.walk("VEVENT")) == []
    assert str(cal["VERSION"]) == "2.0"


def test_calendar_has_a_name_and_a_refresh_hint():
    cal = Calendar.from_ical(build_feed([], calendar_name="Sam's pets", now=NOW))
    assert str(cal["X-WR-CALNAME"]) == "Sam's pets"
    assert str(cal["X-PUBLISHED-TTL"]) == "PT1H"


def test_one_event_per_occurrence_with_pet_and_task_in_the_title():
    out = events(build_feed([occ(1, "Kat"), occ(2, "Max", name="bath", time="09:00")], now=NOW))
    assert [str(e["SUMMARY"]) for e in out] == ["Kat: walk", "Max: bath"]


def test_start_and_end_come_from_the_time_and_duration():
    (e,) = events(build_feed([occ(1, "Kat", time="08:15", dur=45)], now=NOW))
    assert e.decoded("DTSTART") == datetime(2026, 10, 21, 8, 15)
    assert e.decoded("DTEND") == datetime(2026, 10, 21, 9, 0)


def test_times_are_floating_with_no_timezone():
    (e,) = events(build_feed([occ(1, "Kat")], now=NOW))
    assert e.decoded("DTSTART").tzinfo is None
    assert e.decoded("DTEND").tzinfo is None


def test_an_event_can_run_past_midnight():
    (e,) = events(build_feed([occ(1, "Kat", name="meds", time="23:45", dur=30)], now=NOW))
    assert e.decoded("DTEND") == datetime(2026, 10, 22, 0, 15)


def test_uids_are_stable_between_downloads():
    first = events(build_feed([occ(1, "Kat")], now=NOW))[0]
    later = events(build_feed([occ(1, "Kat")], now=NOW + timedelta(days=3)))[0]
    assert str(first["UID"]) == str(later["UID"])


def test_the_uid_survives_a_time_change():
    a = events(build_feed([occ(1, "Kat", time="08:00")], now=NOW))[0]
    b = events(build_feed([occ(1, "Kat", time="09:30")], now=NOW))[0]
    assert str(a["UID"]) == str(b["UID"])


def test_each_event_gets_its_own_uid():
    out = events(build_feed([
        occ(1, "Kat"),
        occ(2, "Max"),
        occ(1, "Kat", day=D + timedelta(days=1)),
    ], now=NOW))
    assert len({str(e["UID"]) for e in out}) == 3


def test_a_linked_group_is_one_event_for_all_its_pets():
    merged = merge_grouped([
        occ(1, "Kat", name="walk Kat", group_id="g"),
        occ(2, "Max", name="walk Max", group_id="g"),
    ])
    out = events(build_feed(merged, now=NOW))
    assert len(out) == 1
    assert str(out[0]["SUMMARY"]) == "Kat & Max: walk"
    assert str(out[0]["UID"]) == event_uid(merged[0])


def test_description_and_category_carry_priority_and_category():
    (e,) = events(build_feed([occ(1, "Kat", priority="non-negotiable", category="meds")], now=NOW))
    desc = str(e["DESCRIPTION"])
    assert "non-negotiable" in desc and "meds" in desc
    assert "meds" in e["CATEGORIES"].to_ical().decode()


def test_awkward_characters_in_names_survive():
    name = "walk, then; brush\nand play"
    (e,) = events(build_feed([occ(1, "Kat", name=name)], now=NOW))
    assert str(e["SUMMARY"]) == f"Kat: {name}"


def test_events_come_out_in_time_order():
    out = events(build_feed([
        occ(2, "Max", name="bath", time="18:00"),
        occ(1, "Kat", time="08:00", day=D + timedelta(days=1)),
        occ(3, "Luna", name="feed", time="07:00"),
    ], now=NOW))
    assert [str(e["SUMMARY"]) for e in out] == ["Luna: feed", "Max: bath", "Kat: walk"]


def test_the_feed_is_standard_crlf_ics_text():
    text = build_feed([occ(1, "Kat")], now=NOW)
    assert text.startswith("BEGIN:VCALENDAR\r\n")
    assert text.endswith("END:VCALENDAR\r\n")