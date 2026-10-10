import re
from datetime import date, timedelta

from pydantic import BaseModel

# Must match Frequency / build_rrule in models.py / recurrence.py.
ONCE, DAILY, WEEKLY = "once", "daily", "weekly"
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

_DAY_INDEX = {name.lower(): i for i, name in enumerate(DAY_NAMES)}
_DAY_INDEX.update({"mon": 0, "tue": 1, "tues": 1, "wed": 2, "thu": 3,
                   "thur": 3, "thurs": 3, "fri": 4, "sat": 5, "sun": 6})
_ANY_DAY = "|".join(sorted(_DAY_INDEX, key=len, reverse=True))  # longest first
_FULL_DAY = "|".join(name.lower() for name in DAY_NAMES)

# Longest cue first, so "after breakfast" wins over "breakfast".
_TIME_CUES = [
    ("after breakfast", "08:30"), ("breakfast", "08:00"), ("lunch", "12:00"),
    ("dinner", "18:00"), ("bedtime", "21:00"), ("morning", "08:00"),
    ("afternoon", "14:00"), ("evening", "18:00"), ("night", "21:00"),
]

# Starting points used only when the text says nothing. Keep these in step
# with the duration/time rules in knowledge_base.md.
DEFAULT_DURATION = {"meds": 5, "feeding": 10, "walk": 30, "vet": 60,
                    "grooming": 20, "play": 20, "training": 20, "general": 15}
DEFAULT_TIME = {"meds": "08:00", "feeding": "08:00", "walk": "08:00", "vet": "10:00",
                "grooming": "10:00", "play": "15:00", "training": "17:00", "general": "09:00"}


class ParsedDetails(BaseModel):
    duration_minutes: int | None = None
    scheduled_time: str | None = None   # "HH:MM"
    frequency: str | None = None
    scheduled_day: str | None = None    # "Saturday", for weekly tasks
    start_date: date | None = None
    assumed: list[str] = []             # fields guessed, not found in the text


def parse_duration(text: str) -> int | None:
    t = text.lower()
    if re.search(r"\bhalf an? hour\b", t):
        return 30
    if re.search(r"(?<!every )\ban? hour\b", t):
        return 60
    m = re.search(r"(?<!every )\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b", t)
    if m:
        minutes = round(float(m.group(1)) * 60)
    else:
        m = re.search(r"(?<!every )\b(\d+)\s*(?:minutes?|mins?)\b", t)
        minutes = int(m.group(1)) if m else None
    return minutes if minutes and 0 < minutes <= 24 * 60 else None


def parse_time(text: str) -> str | None:
    t = text.lower()
    for m in re.finditer(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", t):
        hour, minute = int(m.group(1)), int(m.group(2) or 0)
        if 1 <= hour <= 12 and minute <= 59:
            hour = hour % 12 + (12 if m.group(3) == "pm" else 0)
            return f"{hour:02d}:{minute:02d}"
    m = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", t)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}"
    if re.search(r"\bnoon\b", t):
        return "12:00"
    if re.search(r"\bmidnight\b", t):
        return "00:00"
    if re.search(r"\bat\s+\d", t):
        return None  # a number was given but it's ambiguous or invalid: don't guess
    for cue, value in _TIME_CUES:
        if re.search(rf"\b{cue}\b", t):
            return value
    return None


def _next_weekday(today: date, weekday: int, include_today: bool) -> date:
    delta = (weekday - today.weekday()) % 7
    if delta == 0 and not include_today:
        delta = 7
    return today + timedelta(days=delta)


def _parse_calendar_date(t: str, today: date) -> date | None:
    """US-style month/day, with an optional year."""
    m = re.search(r"(?<![\d/])(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?(?![\d/])", t)
    if not m:
        return None
    month, day = int(m.group(1)), int(m.group(2))
    try:
        if m.group(3):
            year = int(m.group(3))
            return date(year + 2000 if year < 100 else year, month, day)
        result = date(today.year, month, day)
        return result if result >= today else date(today.year + 1, month, day)
    except ValueError:
        return None


def _find_start_date(t: str, today: date) -> date | None:
    if re.search(r"\btomorrow\b", t):
        return today + timedelta(days=1)
    if re.search(r"\b(today|tonight)\b", t):
        return today
    m = re.search(rf"\bnext\s+({_ANY_DAY})\b", t)
    if m:
        return _next_weekday(today, _DAY_INDEX[m.group(1)], include_today=False)
    m = re.search(rf"\b(?:on|this)\s+({_ANY_DAY})\b", t)
    if m:
        return _next_weekday(today, _DAY_INDEX[m.group(1)], include_today=True)
    return _parse_calendar_date(t, today)


def _find_frequency(t: str) -> tuple[str | None, str | None]:
    m = re.search(rf"\bevery\s+({_ANY_DAY})\b", t)
    if m:
        return WEEKLY, DAY_NAMES[_DAY_INDEX[m.group(1)]]
    m = re.search(rf"\b({_FULL_DAY})s\b", t)  # "on Mondays"
    if m:
        return WEEKLY, DAY_NAMES[_DAY_INDEX[m.group(1)]]
    if re.search(r"\b(daily|every\s*day|each\s*day|every\s+(?:morning|afternoon|evening|night))\b", t):
        return DAILY, None
    if re.search(r"\b(weekly|every\s+week|once\s+a\s+week)\b", t):
        return WEEKLY, None
    return None, None


def parse_details(text: str, today: date | None = None) -> ParsedDetails:
    """Pull out only what the text actually says; everything else stays None."""
    today = today or date.today()
    t = text.lower()
    frequency, scheduled_day = _find_frequency(t)
    start = _find_start_date(t, today)
    assumed: list[str] = []

    if frequency is None and start is not None:
        frequency = ONCE
    if frequency == WEEKLY and scheduled_day is None:
        scheduled_day = DAY_NAMES[(start or today).weekday()]
        assumed.append("scheduled_day")

    return ParsedDetails(
        duration_minutes=parse_duration(text),
        scheduled_time=parse_time(text),
        frequency=frequency,
        scheduled_day=scheduled_day,
        start_date=start,
        assumed=assumed,
    )


def fill_defaults(parsed: ParsedDetails, category: str, today: date | None = None) -> ParsedDetails:
    """Fill every gap, and record each guess in `assumed` so the UI can show it."""
    today = today or date.today()
    data = parsed.model_dump()
    assumed = list(parsed.assumed)

    if data["duration_minutes"] is None:
        data["duration_minutes"] = DEFAULT_DURATION.get(category, 15)
        assumed.append("duration_minutes")
    if data["scheduled_time"] is None:
        data["scheduled_time"] = DEFAULT_TIME.get(category, "09:00")
        assumed.append("scheduled_time")
    if data["frequency"] is None:
        data["frequency"] = DAILY
        assumed.append("frequency")
    if data["start_date"] is None:
        data["start_date"] = today
        assumed.append("start_date")

    data["assumed"] = assumed
    return ParsedDetails(**data)