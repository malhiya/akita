import pytest
from pydantic import ValidationError

from models import TaskCreate

VALID = {
    "name": "Morning walk",
    "category": "walk",
    "priority": "high",
    "duration_minutes": 30,
    "scheduled_time": "08:00",
    "start_date": "2026-10-10",
    "frequency": "daily",
}


def make(**overrides):
    return TaskCreate(**{**VALID, **overrides})


def test_valid_task_is_accepted():
    task = make()
    assert task.name == "Morning walk"


@pytest.mark.parametrize("bad_time", ["8:30", "25:00", "08:60", "0830", "ab:cd"])
def test_bad_time_rejected(bad_time):
    with pytest.raises(ValidationError):
        make(scheduled_time=bad_time)


def test_unknown_priority_rejected():
    with pytest.raises(ValidationError):
        make(priority="urgent")


def test_unknown_category_rejected():
    with pytest.raises(ValidationError):
        make(category="napping")


@pytest.mark.parametrize("bad_duration", [0, 241])
def test_duration_out_of_range_rejected(bad_duration):
    with pytest.raises(ValidationError):
        make(duration_minutes=bad_duration)


def test_end_before_start_rejected():
    with pytest.raises(ValidationError):
        make(start_date="2026-10-10", end_date="2026-10-01")


def test_weekly_without_day_rejected():
    with pytest.raises(ValidationError):
        make(frequency="weekly")


def test_weekly_with_day_accepted():
    task = make(frequency="weekly", scheduled_day="Saturday")
    assert task.scheduled_day == "Saturday"