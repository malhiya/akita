from datetime import date

from recurrence import expand_occurrences

START = date(2026, 10, 19)
END = date(2026, 10, 25)


def one_time(on):
    return expand_occurrences(None, on, None, START, END)


def test_a_one_time_task_inside_the_range_is_returned():
    assert one_time(date(2026, 10, 21)) == [date(2026, 10, 21)]


def test_a_one_time_task_on_the_first_and_last_day_is_returned():
    assert one_time(START) == [START]
    assert one_time(END) == [END]


def test_a_one_time_task_before_the_range_is_not_returned():
    assert one_time(date(2026, 10, 18)) == []
    assert one_time(date(2026, 9, 1)) == []


def test_a_one_time_task_after_the_range_is_not_returned():
    assert one_time(date(2026, 10, 26)) == []


def test_a_repeating_task_still_starts_inside_the_range():
    assert expand_occurrences("RRULE:FREQ=DAILY", date(2026, 9, 1), None, START, date(2026, 10, 21)) == [
        date(2026, 10, 19), date(2026, 10, 20), date(2026, 10, 21),
    ]