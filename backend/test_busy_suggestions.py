from datetime import date
from types import SimpleNamespace

from conflicts import busy_occurrence
from models import Occurrence
from suggestions import NON_NEGOTIABLE_NOTE, suggest_fix

D = date(2026, 10, 21)


def occ(task_id, pet, name, time, dur=30, priority="high", category="walk"):
    return Occurrence(
        task_id=task_id, pet_id=task_id, pet_name=pet, name=name, category=category,
        priority=priority, occurs_on=D, time=time, duration_minutes=dur,
        pet_names=[pet], task_ids=[task_id],
    )


class FakeClient:
    def __init__(self, content=None, error=None):
        self.content, self.error, self.kwargs = content, error, None
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.kwargs = kwargs
        if self.error:
            raise self.error
        message = SimpleNamespace(content=self.content)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


# Kat's walk 09:00-09:30 clashes with a meeting 09:15-10:00 (minutes 555-600).
def walk_and_meeting(priority="high"):
    walk = occ(1, "Kat", "walk", "09:00", priority=priority)
    meeting = busy_occurrence(D, 555, 600)
    return walk, meeting, [walk], [(D, 555, 600)]


def test_the_pet_task_moves_never_the_calendar():
    walk, meeting, day, busy = walk_and_meeting()
    s = suggest_fix(None, walk, meeting, day, busy)
    assert s.move_task_ids == [1] and s.old_time == "09:00"
    assert s.new_time == "08:45"            # 08:45-09:15 ends as the meeting starts


def test_a_suggested_time_never_lands_on_calendar_time():
    walk, meeting, day, busy = walk_and_meeting()
    # also block 08:45-09:15 by another task, so the next best must dodge both
    other = occ(2, "Max", "feed", "08:45", priority="high", category="feeding")
    s = suggest_fix(None, walk, meeting, [walk, other], busy)
    start = int(s.new_time[:2]) * 60 + int(s.new_time[3:])
    assert not (start < 600 and 555 < start + 30)       # clear of the meeting
    assert not (start < 8 * 60 + 45 + 30 and 8 * 60 + 45 < start + 30)  # clear of the other task


def test_calendar_time_alone_is_enough_to_block_slots():
    walk, meeting, _, _ = walk_and_meeting()
    # the whole workday is busy: no suggestion
    s = suggest_fix(None, walk, meeting, [walk], [(D, 6 * 60, 22 * 60)])
    assert s.new_time is None and "No free time" in s.reason


def test_a_non_negotiable_task_can_still_be_moved_off_the_calendar_with_a_warning():
    walk, meeting, day, busy = walk_and_meeting(priority="non-negotiable")
    s = suggest_fix(None, walk, meeting, day, busy)
    assert s.new_time == "08:45"
    assert NON_NEGOTIABLE_NOTE in s.notice


def test_the_warning_is_added_to_an_existing_notice():
    walk, meeting, day, busy = walk_and_meeting(priority="non-negotiable")
    s = suggest_fix(FakeClient(error=RuntimeError("boom")), walk, meeting, day, busy)
    assert "unavailable" in s.notice and NON_NEGOTIABLE_NOTE in s.notice


def test_ordinary_priority_gets_no_extra_warning():
    walk, meeting, day, busy = walk_and_meeting(priority="high")
    assert suggest_fix(None, walk, meeting, day, busy).notice == (
        "AI suggestions aren't configured; used the closest free time."
    )


def test_ai_choice_from_the_offered_slots_is_used_for_a_calendar_clash():
    walk, meeting, day, busy = walk_and_meeting()
    good = '{"time": "08:45", "reason": "Just before your meeting."}'
    s = suggest_fix(FakeClient(good), walk, meeting, day, busy)
    assert s.source == "ai" and s.new_time == "08:45" and s.notice is None


def test_the_prompt_describes_the_calendar_by_time_only():
    walk, meeting, day, busy = walk_and_meeting()
    client = FakeClient('{"time": "08:45", "reason": "ok"}')
    suggest_fix(client, walk, meeting, day, busy)
    prompt = " ".join(m["content"] for m in client.kwargs["messages"])
    assert "owner's own calendar" in prompt and "09:15" in prompt
    assert "Your calendar" not in prompt and "Busy" not in prompt


def test_old_behaviour_is_unchanged_without_a_calendar():
    a = occ(1, "Kat", "walk", "08:00", priority="high")
    b = occ(2, "Max", "bath", "08:15", priority="medium", category="grooming")
    s = suggest_fix(None, a, b, [a, b])
    assert s.move_task_ids == [2] and s.new_time == "08:30"