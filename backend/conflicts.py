from datetime import datetime, timedelta

from models import Conflict, Occurrence, Task


def _span(o: Occurrence) -> tuple[datetime, datetime]:
    start = datetime.strptime(f"{o.occurs_on.isoformat()} {o.time}", "%Y-%m-%d %H:%M")
    return start, start + timedelta(minutes=o.duration_minutes)


def _signature(t: Task) -> tuple:
    """Everything that makes two tasks 'the same task' for different pets."""
    return (
        t.name.strip().lower(), t.category, t.priority, t.scheduled_time,
        t.duration_minutes, t.rrule, t.start_date, t.end_date,
    )


def _kind(a: Occurrence, b: Occurrence, tasks: dict[int, Task]) -> str:
    if _signature(tasks[a.task_ids[0]]) != _signature(tasks[b.task_ids[0]]):
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