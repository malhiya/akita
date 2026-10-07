import pytest

from recurrence import build_rrule, parse_rrule

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def test_once_has_no_rule():
    assert build_rrule("once") is None


def test_daily():
    assert build_rrule("daily") == "RRULE:FREQ=DAILY"


def test_weekly_saturday():
    assert build_rrule("weekly", "Saturday") == "RRULE:FREQ=WEEKLY;BYDAY=SA"


def test_weekly_requires_a_day():
    with pytest.raises(ValueError):
        build_rrule("weekly")


def test_weekly_rejects_unknown_day():
    with pytest.raises(ValueError):
        build_rrule("weekly", "Funday")


def test_unknown_frequency_rejected():
    with pytest.raises(ValueError):
        build_rrule("hourly")


def test_parse_none_means_once():
    assert parse_rrule(None) == {"frequency": "once", "scheduled_day": None}


def test_parse_unrecognized_rule_rejected():
    with pytest.raises(ValueError):
        parse_rrule("RRULE:FREQ=MONTHLY")


@pytest.mark.parametrize("day", DAYS)
def test_weekly_round_trip(day):
    rule = build_rrule("weekly", day)
    assert parse_rrule(rule) == {"frequency": "weekly", "scheduled_day": day}


def test_daily_round_trip():
    rule = build_rrule("daily")
    assert parse_rrule(rule) == {"frequency": "daily", "scheduled_day": None}


    