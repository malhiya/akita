from datetime import date
from recurrence import build_rrule
import pytest

from task_parser import (
    DAILY, ONCE, WEEKLY,
    fill_defaults, parse_details, parse_duration, parse_time,
)

TODAY = date(2026, 10, 9)  # a Friday


@pytest.mark.parametrize("text, expected", [
    ("walk Max for 30 minutes", 30),
    ("walk Max 45 mins", 45),
    ("brush Whiskers for an hour", 60),
    ("play for half an hour", 30),
    ("walk for 1.5 hours", 90),
    ("give meds every 2 hours", None),  # a repeat interval, not a duration
    ("give meds at 8am", None),         # '8am' is a time, not minutes
    ("walk Max", None),
])
def test_duration(text, expected):
    assert parse_duration(text) == expected


@pytest.mark.parametrize("text, expected", [
    ("meds at 8am", "08:00"),
    ("dinner at 6:30pm", "18:30"),
    ("meds at 12am", "00:00"),
    ("lunch at 12pm", "12:00"),
    ("walk at 18:30", "18:30"),
    ("feed at noon", "12:00"),
    ("walk every morning", "08:00"),
    ("feed after breakfast", "08:30"),
    ("feed at 8", None),       # am or pm? don't guess
    ("dinner at 8", None),     # a stated number beats the word 'dinner'
    ("meds at 13pm", None),
    ("do the thing", None),
])
def test_time(text, expected):
    assert parse_time(text) == expected


@pytest.mark.parametrize("text, frequency, day, start", [
    ("walk Max every morning", DAILY, None, None),
    ("meds daily", DAILY, None, None),
    ("bath every Saturday", WEEKLY, "Saturday", None),
    ("brush Whiskers on Sundays", WEEKLY, "Sunday", None),
    ("vet tomorrow", ONCE, None, date(2026, 10, 10)),
    ("vet next Monday", ONCE, None, date(2026, 10, 12)),
    ("vet next Friday", ONCE, None, date(2026, 10, 16)),   # 'next' skips today
    ("vet on Friday", ONCE, None, date(2026, 10, 9)),      # 'on' includes today
    ("vet on 10/15", ONCE, None, date(2026, 10, 15)),
    ("vet on 1/5", ONCE, None, date(2027, 1, 5)),          # already past, so next year
    ("give meds every day starting tomorrow", DAILY, None, date(2026, 10, 10)),
    ("feed Max dinner", None, None, None),
])
def test_recurrence(text, frequency, day, start):
    parsed = parse_details(text, today=TODAY)
    assert (parsed.frequency, parsed.scheduled_day, parsed.start_date) == (frequency, day, start)


def test_weekly_without_day_uses_start_weekday():
    parsed = parse_details("weekly nail trim", today=TODAY)
    assert parsed.frequency == WEEKLY and parsed.scheduled_day == "Friday"
    assert "scheduled_day" in parsed.assumed


@pytest.mark.parametrize("text", ["", "xyzzy"])
def test_nothing_found(text):
    parsed = parse_details(text, today=TODAY)
    assert parsed.model_dump(exclude={"assumed"}) == {
        "duration_minutes": None, "scheduled_time": None,
        "frequency": None, "scheduled_day": None, "start_date": None,
    }
    assert parsed.assumed == []


def test_defaults_for_vague_task():
    filled = fill_defaults(parse_details("do the morning thing", TODAY), "general", TODAY)
    assert filled.scheduled_time == "08:00"  # from the word 'morning', so not assumed
    assert filled.duration_minutes == 15
    assert filled.frequency == DAILY and filled.start_date == TODAY
    assert set(filled.assumed) == {"duration_minutes", "frequency", "start_date"}


def test_category_defaults_for_grooming():
    filled = fill_defaults(parse_details("brush Whiskers", TODAY), "grooming", TODAY)
    assert filled.scheduled_time == "10:00" and filled.duration_minutes == 20
    assert set(filled.assumed) == {"duration_minutes", "scheduled_time", "frequency", "start_date"}


def test_stated_values_are_preserved():
    text = "walk Max at 7:15am for 40 minutes every Saturday"
    filled = fill_defaults(parse_details(text, TODAY), "walk", TODAY)
    assert filled.scheduled_time == "07:15" and filled.duration_minutes == 40
    assert (filled.frequency, filled.scheduled_day) == (WEEKLY, "Saturday")
    assert set(filled.assumed) == {"start_date"}


def test_one_time_task_stays_one_time():
    filled = fill_defaults(parse_details("vet tomorrow", TODAY), "vet", TODAY)
    assert filled.frequency == ONCE and filled.start_date == date(2026, 10, 10)
    assert filled.duration_minutes == 60 and filled.scheduled_time == "10:00"
    assert set(filled.assumed) == {"duration_minutes", "scheduled_time"}


def test_parsed_output_builds_valid_rrules():
    weekly = fill_defaults(parse_details("bath every Saturday", TODAY), "grooming", TODAY)
    daily = fill_defaults(parse_details("walk every morning", TODAY), "walk", TODAY)
    once = fill_defaults(parse_details("vet tomorrow", TODAY), "vet", TODAY)
    assert build_rrule(weekly.frequency, weekly.scheduled_day) == "RRULE:FREQ=WEEKLY;BYDAY=SA"
    assert build_rrule(daily.frequency, daily.scheduled_day) == "RRULE:FREQ=DAILY"
    assert build_rrule(once.frequency, once.scheduled_day) is None