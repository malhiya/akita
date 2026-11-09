from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import icalendar
import recurring_ical_events

MAX_BYTES = 2_000_000
MAX_BLOCKS = 5000


class CalendarImportError(Exception):
    """The uploaded file can't be used. The message is safe to show the user."""


def _to_local(value, tz: ZoneInfo) -> datetime:
    """A calendar time as naive local time in the user's timezone."""
    if value.tzinfo is not None:
        return value.astimezone(tz).replace(tzinfo=None)
    return value  # "floating" time: already the user's local time


def _merge(spans: list[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    merged: list[tuple[datetime, datetime]] = []
    for start, end in sorted(spans):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def parse_busy_blocks(
    data: bytes | str, tz_name: str, start: date, end: date
) -> list[tuple[datetime, datetime]]:
    """Busy time ranges from an .ics file, as naive local datetimes inside [start, end].

    Only times are returned: titles, locations, attendees and notes are never read
    out of the file. All-day events, events marked 'free' (transparent) and
    cancelled events are skipped, and overlapping events are merged.
    """
    raw = data.encode() if isinstance(data, str) else data
    if len(raw) > MAX_BYTES:
        raise CalendarImportError("That calendar file is too large (over 2 MB).")
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        raise CalendarImportError("Unknown timezone.") from None
    try:
        calendar = icalendar.Calendar.from_ical(raw)
        # Query a day wider on each side: the library treats a plain date range
        # strictly, so events crossing midnight or shifted by timezone could be
        # missed. We clip to the real window below.
        events = recurring_ical_events.of(calendar).between(
            start - timedelta(days=1), end + timedelta(days=2)
        )
    except Exception:
        raise CalendarImportError("That doesn't look like a valid .ics calendar file.") from None

    window_start = datetime.combine(start, time.min)
    window_end = datetime.combine(end + timedelta(days=1), time.min)

    spans: list[tuple[datetime, datetime]] = []
    for event in events:
        if str(event.get("TRANSP", "")).upper() == "TRANSPARENT":
            continue
        if str(event.get("STATUS", "")).upper() == "CANCELLED":
            continue
        ev_start, ev_end = event.start, event.end
        if not isinstance(ev_start, datetime) or not isinstance(ev_end, datetime):
            continue  # all-day events (birthdays, holidays) don't block time
        s, e = _to_local(ev_start, tz), _to_local(ev_end, tz)
        s, e = max(s, window_start), min(e, window_end)
        if e > s:
            spans.append((s, e))

    blocks = _merge(spans)
    if len(blocks) > MAX_BLOCKS:
        raise CalendarImportError("That calendar has too many events in this period.")
    return blocks


def split_by_day(blocks: list[tuple[datetime, datetime]]) -> list[tuple[date, int, int]]:
    """Cut busy blocks at midnight into (day, start_minute, end_minute) pieces."""
    pieces: list[tuple[date, int, int]] = []
    for start, end in blocks:
        day = start.date()
        while True:
            day_start = datetime.combine(day, time.min)
            day_end = day_start + timedelta(days=1)
            s = int((max(start, day_start) - day_start).total_seconds() // 60)
            e = int((min(end, day_end) - day_start).total_seconds() // 60)
            if e > s:
                pieces.append((day, s, e))
            if end <= day_end:
                break
            day += timedelta(days=1)
    return pieces