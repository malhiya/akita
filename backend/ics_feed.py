from datetime import datetime, time, timedelta, timezone

from icalendar import Calendar, Event

from models import Occurrence

PRODID = "-//Akita//Pet care schedule//EN"


def event_uid(o: Occurrence) -> str:
    """Stable per event: the same task(s) on the same day keep the same UID,
    so a calendar app updates the event when its time changes instead of duplicating it."""
    ids = o.task_ids or [o.task_id]
    return f"akita-{'-'.join(str(i) for i in ids)}-{o.occurs_on.isoformat()}@akita"


def build_feed(
    occurrences: list[Occurrence],
    calendar_name: str = "Akita pet schedule",
    now: datetime | None = None,
) -> str:
    """Turn (already merged) pet occurrences into .ics text.

    Times are floating (no timezone): a subscriber sees the same clock time you set.
    Only pet tasks go in here. Nothing from an uploaded calendar is ever included."""
    stamp = now or datetime.now(timezone.utc)

    cal = Calendar()
    cal.add("prodid", PRODID)
    cal.add("version", "2.0")
    cal.add("x-wr-calname", calendar_name)
    cal.add("x-published-ttl", "PT1H")

    for o in sorted(occurrences, key=lambda o: (o.occurs_on, o.time, event_uid(o))):
        start = datetime.combine(o.occurs_on, time.fromisoformat(o.time))
        ev = Event()
        ev.add("uid", event_uid(o))
        ev.add("dtstamp", stamp)
        ev.add("dtstart", start)
        ev.add("dtend", start + timedelta(minutes=o.duration_minutes))
        ev.add("summary", f"{o.pet_name}: {o.name}")
        ev.add("description", f"Priority: {o.priority}\nCategory: {o.category}")
        ev.add("categories", [o.category])
        cal.add_component(ev)

    return cal.to_ical().decode("utf-8")