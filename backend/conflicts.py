import re
from datetime import date, datetime, timedelta

from models import Conflict, Occurrence, Task

# One stretch of the owner's own calendar: (day, start_minute, end_minute after midnight)
BusyPiece = tuple[date, int, int]


def _span(o: Occurrence) -> tuple[datetime, datetime]:
    start = datetime.strptime(f"{o.occurs_on.isoformat()} {o.time}", "%Y-%m-%d %H:%M")
    return start, start + timedelta(minutes=o.duration_minutes)


def _minutes(t: str) -> int:
    h, _, m = t.partition(":")
    return int(h) * 60 + int(m)


def _hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower())


def _base_name(name: str, pet_names: list[str]) -> str:
    """The task name with its own pets' names removed, so 'walk Kat' matches 'walk Max'."""
    own = {w for p in pet_names for w in _words(p)}
    return " ".join(w for w in _words(name) if w not in own)


def _signature(t: Task, pet_names: list[str]) -> tuple:
    """Everything that makes two tasks 'the same task' for different pets."""
    return (
        _base_name(t.name, pet_names), t.category, t.priority, t.scheduled_time,
        t.duration_minutes, t.rrule, t.start_date, t.end_date,
    )


def _kind(a: Occurrence, b: Occurrence, tasks: dict[int, Task]) -> str:
    sig_a = _signature(tasks[a.task_ids[0]], a.pet_names)
    sig_b = _signature(tasks[b.task_ids[0]], b.pet_names)
    if sig_a != sig_b:
        return "overlap"
    pets_a = {tasks[i].pet_id for i in a.task_ids}
    pets_b = {tasks[i].pet_id for i in b.task_ids}
    return "duplicate" if pets_a & pets_b else "identical"


def busy_overlaps(o: Occurrence, busy: list[BusyPiece]) -> list[tuple[date, int, int, int]]:
    """Pieces of the owner's calendar that overlap event `o`, as (day, start, end, overlap_minutes).

    Looks at the event's own day and the next one, so an event that runs past midnight
    is still checked against early-morning busy time.
    """
    s = _minutes(o.time)
    e = s + o.duration_minutes
    hits = []
    for day, bs, be in busy:
        shift = (day - o.occurs_on).days * 1440
        if shift not in (0, 1440):
            continue
        lo, hi = max(s, bs + shift), min(e, be + shift)
        if hi > lo:
            hits.append((day, bs, be, hi - lo))
    return sorted(hits)


def busy_occurrence(day: date, start_minute: int, end_minute: int) -> Occurrence:
    """A stand-in 'event' for a stretch of the owner's calendar. It has no task ids, no title."""
    return Occurrence(
        task_id=0, pet_id=0, pet_name="Your calendar", name="Busy", category="general",
        priority="non-negotiable", occurs_on=day, time=_hhmm(start_minute),
        duration_minutes=end_minute - start_minute, pet_names=["Your calendar"], task_ids=[],
    )


def detect_conflicts(
    occurrences: list[Occurrence], tasks: dict[int, Task], busy: list[BusyPiece] | None = None
) -> list[Conflict]:
    """Find overlapping events for the owner.

    `occurrences` must already be merged (see group_merge.merge_grouped), so pets
    sharing one linked event are a single item and never conflict with each other.
    One Conflict is returned per pair of events, with every date it happens on.
    If `busy` (the owner's uploaded calendar) is given, pet events that overlap it
    are reported too, as kind "busy", one conflict per pet event.
    """
    spans = sorted(((*_span(o), o) for o in occurrences), key=lambda s: s[0])
    found: dict[tuple, Conflict] = {}
    for i in range(len(spans)):
        a_start, a_end, a = spans[i]
        for j in range(i + 1, len(spans)):
            b_start, b_end, b = spans[j]
            if b_start >= a_end:
                break  # sorted by start, so nothing later can overlap a
            pair = tuple(sorted((tuple(a.task_ids), tuple(b.task_ids))))
            existing = found.get(pair)
            if existing:
                existing.dates.append(a.occurs_on)
                continue
            overlap = int((min(a_end, b_end) - b_start).total_seconds() // 60)
            found[pair] = Conflict(
                kind=_kind(a, b, tasks), a=a, b=b,
                overlap_minutes=overlap, dates=[a.occurs_on],
            )

    result = list(found.values())
    if busy:
        by_event: dict[tuple, Conflict] = {}
        for o in sorted(occurrences, key=lambda o: (o.occurs_on, o.time)):
            hits = busy_overlaps(o, busy)
            if not hits:
                continue
            existing = by_event.get(tuple(o.task_ids))
            if existing:
                existing.dates.append(o.occurs_on)
                continue
            day, bs, be, _ = hits[0]
            by_event[tuple(o.task_ids)] = Conflict(
                kind="busy", a=o, b=busy_occurrence(day, bs, be),
                overlap_minutes=sum(h[3] for h in hits), dates=[o.occurs_on],
            )
        result.extend(by_event.values())
    return result