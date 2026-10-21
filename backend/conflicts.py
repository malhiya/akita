import re
from datetime import datetime, timedelta

from models import Conflict, Occurrence, Task


def _span(o: Occurrence) -> tuple[datetime, datetime]:
    start = datetime.strptime(f"{o.occurs_on.isoformat()} {o.time}", "%Y-%m-%d %H:%M")
    return start, start + timedelta(minutes=o.duration_minutes)


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


def detect_conflicts(occurrences: list[Occurrence], tasks: dict[int, Task]) -> list[Conflict]:
    """Find overlapping events for the owner.

    `occurrences` must already be merged (see group_merge.merge_grouped), so pets
    sharing one linked event are a single item and never conflict with each other.
    One Conflict is returned per pair of events, with every date it happens on.
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
    return list(found.values())