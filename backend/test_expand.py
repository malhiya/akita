from datetime import date as D

from recurrence import expand_occurrences

DAILY = "RRULE:FREQ=DAILY"
SATURDAYS = "RRULE:FREQ=WEEKLY;BYDAY=SA"


def test_daily_over_a_week():
    days = expand_occurrences(DAILY, D(2026, 10, 10), None, D(2026, 10, 10), D(2026, 10, 16))
    assert len(days) == 7
    assert days[0] == D(2026, 10, 10) and days[-1] == D(2026, 10, 16)


def test_end_date_truncates():
    days = expand_occurrences(DAILY, D(2026, 10, 10), D(2026, 10, 12), D(2026, 10, 1), D(2026, 10, 31))
    assert days == [D(2026, 10, 10), D(2026, 10, 11), D(2026, 10, 12)]


def test_window_starting_after_task_start():
    days = expand_occurrences(DAILY, D(2026, 10, 1), None, D(2026, 10, 10), D(2026, 10, 12))
    assert days == [D(2026, 10, 10), D(2026, 10, 11), D(2026, 10, 12)]


def test_weekly_saturdays():
    days = expand_occurrences(SATURDAYS, D(2026, 10, 10), None, D(2026, 10, 10), D(2026, 10, 31))
    assert days == [D(2026, 10, 10), D(2026, 10, 17), D(2026, 10, 24), D(2026, 10, 31)]


def test_weekly_starting_midweek_skips_to_first_matching_day():
    # Oct 7, 2026 is a Wednesday, so the first Saturday is Oct 10
    days = expand_occurrences(SATURDAYS, D(2026, 10, 7), None, D(2026, 10, 7), D(2026, 10, 20))
    assert days == [D(2026, 10, 10), D(2026, 10, 17)]


def test_one_time_task_inside_window():
    assert expand_occurrences(None, D(2026, 10, 12), None, D(2026, 10, 10), D(2026, 10, 16)) == [D(2026, 10, 12)]


def test_one_time_task_outside_window():
    assert expand_occurrences(None, D(2026, 11, 1), None, D(2026, 10, 10), D(2026, 10, 16)) == []


def test_window_entirely_before_task_start():
    assert expand_occurrences(DAILY, D(2026, 11, 1), None, D(2026, 10, 10), D(2026, 10, 16)) == []