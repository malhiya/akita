from datetime import date, datetime

import pytest

from calendar_import import CalendarImportError, parse_busy_blocks, split_by_day

NY = "America/New_York"
START, END = date(2026, 10, 19), date(2026, 11, 8)


def ics(*events: str) -> str:
    return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n" + "".join(events) + "END:VCALENDAR\r\n"


def event(uid, *lines) -> str:
    body = "".join(f"{line}\r\n" for line in lines)
    return f"BEGIN:VEVENT\r\nUID:{uid}\r\nDTSTAMP:20261001T000000Z\r\n{body}END:VEVENT\r\n"


def dt(*args):
    return datetime(*args)


def test_utc_times_are_converted_to_the_users_timezone():
    # 13:00 UTC on Oct 20 is 9:00 in New York (daylight time)
    cal = ics(event("a", "DTSTART:20261020T130000Z", "DTEND:20261020T140000Z", "SUMMARY:Dentist"))
    assert parse_busy_blocks(cal, NY, START, END) == [(dt(2026, 10, 20, 9), dt(2026, 10, 20, 10))]


def test_times_with_a_tzid_are_converted():
    cal = ics(event("a", "DTSTART;TZID=America/Chicago:20261020T080000",
                    "DTEND;TZID=America/Chicago:20261020T090000"))
    assert parse_busy_blocks(cal, NY, START, END) == [(dt(2026, 10, 20, 9), dt(2026, 10, 20, 10))]


def test_floating_times_are_taken_as_local():
    cal = ics(event("a", "DTSTART:20261020T090000", "DTEND:20261020T100000"))
    assert parse_busy_blocks(cal, NY, START, END) == [(dt(2026, 10, 20, 9), dt(2026, 10, 20, 10))]


def test_all_day_events_do_not_block_time():
    cal = ics(event("a", "DTSTART;VALUE=DATE:20261020", "DTEND;VALUE=DATE:20261021", "SUMMARY:Birthday"))
    assert parse_busy_blocks(cal, NY, START, END) == []


def test_free_and_cancelled_events_are_skipped():
    cal = ics(
        event("a", "DTSTART:20261020T090000", "DTEND:20261020T100000", "TRANSP:TRANSPARENT"),
        event("b", "DTSTART:20261021T090000", "DTEND:20261021T100000", "STATUS:CANCELLED"),
    )
    assert parse_busy_blocks(cal, NY, START, END) == []


def test_weekly_repeating_event_is_expanded_inside_the_window():
    cal = ics(event("a", "DTSTART;TZID=America/New_York:20261020T090000",
                    "DTEND;TZID=America/New_York:20261020T100000", "RRULE:FREQ=WEEKLY;BYDAY=TU"))
    blocks = parse_busy_blocks(cal, NY, START, END)
    assert [b[0] for b in blocks] == [dt(2026, 10, 20, 9), dt(2026, 10, 27, 9), dt(2026, 11, 3, 9)]


def test_excluded_dates_are_respected():
    cal = ics(event("a", "DTSTART;TZID=America/New_York:20261020T090000",
                    "DTEND;TZID=America/New_York:20261020T100000", "RRULE:FREQ=WEEKLY;BYDAY=TU",
                    "EXDATE;TZID=America/New_York:20261027T090000"))
    starts = [b[0] for b in parse_busy_blocks(cal, NY, START, END)]
    assert dt(2026, 10, 27, 9) not in starts and len(starts) == 2


def test_a_repeating_event_keeps_its_clock_time_across_the_daylight_change():
    # US clocks go back on Nov 1 2026; a 9:00 New York meeting is still 9:00 after
    cal = ics(event("a", "DTSTART;TZID=America/New_York:20261029T090000",
                    "DTEND;TZID=America/New_York:20261029T100000", "RRULE:FREQ=DAILY;COUNT=5"))
    starts = [b[0] for b in parse_busy_blocks(cal, NY, START, END)]
    assert [s.hour for s in starts] == [9, 9, 9, 9, 9]


def test_overlapping_events_are_merged():
    cal = ics(
        event("a", "DTSTART:20261020T090000", "DTEND:20261020T100000"),
        event("b", "DTSTART:20261020T093000", "DTEND:20261020T110000"),
    )
    assert parse_busy_blocks(cal, NY, START, END) == [(dt(2026, 10, 20, 9), dt(2026, 10, 20, 11))]


def test_events_outside_the_window_are_ignored():
    cal = ics(event("a", "DTSTART:20270101T090000", "DTEND:20270101T100000"))
    assert parse_busy_blocks(cal, NY, START, END) == []


def test_an_event_crossing_the_window_start_is_clipped():
    cal = ics(event("a", "DTSTART:20261018T220000", "DTEND:20261019T020000"))
    assert parse_busy_blocks(cal, NY, START, END) == [(dt(2026, 10, 19, 0), dt(2026, 10, 19, 2))]


def test_only_times_are_returned_never_titles():
    cal = ics(event("a", "DTSTART:20261020T090000", "DTEND:20261020T100000",
                    "SUMMARY:Secret therapy", "LOCATION:Somewhere", "DESCRIPTION:Private"))
    blocks = parse_busy_blocks(cal, NY, START, END)
    assert all(isinstance(x, datetime) for b in blocks for x in b)
    assert "Secret" not in repr(blocks)


def test_garbage_is_rejected_with_a_friendly_error():
    with pytest.raises(CalendarImportError, match="valid .ics"):
        parse_busy_blocks("this is not a calendar", NY, START, END)


def test_unknown_timezone_is_rejected():
    with pytest.raises(CalendarImportError, match="timezone"):
        parse_busy_blocks(ics(), "Mars/Olympus", START, END)


def test_oversized_files_are_rejected():
    with pytest.raises(CalendarImportError, match="too large"):
        parse_busy_blocks("x" * 3_000_000, NY, START, END)


def test_a_utc_event_that_lands_on_the_last_day_locally_is_kept():
    # 03:00 UTC on Nov 9 is 22:00 on Nov 8 in New York (standard time), the last day of the window
    cal = ics(event("a", "DTSTART:20261109T030000Z", "DTEND:20261109T040000Z"))
    assert parse_busy_blocks(cal, NY, START, END) == [(dt(2026, 11, 8, 22), dt(2026, 11, 8, 23))]


def test_a_utc_event_that_lands_before_the_window_locally_is_dropped():
    # 03:00 UTC on Oct 19 is 23:00 on Oct 18 in New York, before the window
    cal = ics(event("a", "DTSTART:20261019T030000Z", "DTEND:20261019T040000Z"))
    assert parse_busy_blocks(cal, NY, START, END) == []


def test_blocks_are_split_at_midnight():
    pieces = split_by_day([(dt(2026, 10, 20, 23, 0), dt(2026, 10, 21, 2, 0))])
    assert pieces == [(date(2026, 10, 20), 1380, 1440), (date(2026, 10, 21), 0, 120)]


def test_a_block_inside_one_day_is_one_piece():
    assert split_by_day([(dt(2026, 10, 20, 9), dt(2026, 10, 20, 10, 30))]) == [(date(2026, 10, 20), 540, 630)]


def test_a_block_ending_exactly_at_midnight_does_not_spill_into_the_next_day():
    assert split_by_day([(dt(2026, 10, 20, 22), dt(2026, 10, 21, 0))]) == [(date(2026, 10, 20), 1320, 1440)]