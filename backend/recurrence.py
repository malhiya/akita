from datetime import date, datetime, time

from dateutil.rrule import rrulestr

WEEKDAY_TO_CODE = {
    "Monday": "MO", "Tuesday": "TU", "Wednesday": "WE", "Thursday": "TH",
    "Friday": "FR", "Saturday": "SA", "Sunday": "SU",
}
CODE_TO_WEEKDAY = {code: day for day, code in WEEKDAY_TO_CODE.items()}



def build_rrule(frequency: str, scheduled_day: str | None = None) -> str | None:
    """Turn the form's simple choice into an RRULE string for storage."""
    if frequency == "once":
        return None  # no rule means a single event on start_date
    if frequency == "daily":
        return "RRULE:FREQ=DAILY"
    if frequency == "weekly":
        if scheduled_day not in WEEKDAY_TO_CODE:
            raise ValueError("weekly frequency requires a valid scheduled_day")
        return f"RRULE:FREQ=WEEKLY;BYDAY={WEEKDAY_TO_CODE[scheduled_day]}"
    raise ValueError(f"unsupported frequency: {frequency}")


def parse_rrule(rrule: str | None) -> dict:
    """Turn a stored RRULE string back into the simple shape the edit form shows."""
    if rrule is None:
        return {"frequency": "once", "scheduled_day": None}
    if rrule == "RRULE:FREQ=DAILY":
        return {"frequency": "daily", "scheduled_day": None}
    if rrule.startswith("RRULE:FREQ=WEEKLY;BYDAY="):
        code = rrule.split("BYDAY=")[1]
        if code in CODE_TO_WEEKDAY:
            return {"frequency": "weekly", "scheduled_day": CODE_TO_WEEKDAY[code]}
    raise ValueError(f"unrecognized rrule: {rrule}")

def expand_occurrences(
    rrule: str | None,
    start_date: date,
    end_date: date | None,
    range_start: date,
    range_end: date,
) -> list[date]:
    """Dates a task occurs on, within [range_start, range_end]."""
    window_start = max(start_date, range_start)
    window_end = min(end_date, range_end) if end_date else range_end
    if window_start > window_end:
        return []

    if rrule is None:  # one-time task
        return [start_date]  # already known to sit inside the window

    rule = rrulestr(rrule, dtstart=datetime.combine(start_date, time.min))
    after = datetime.combine(window_start, time.min)
    before = datetime.combine(window_end, time.max)
    return [d.date() for d in rule.between(after, before, inc=True)]