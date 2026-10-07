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