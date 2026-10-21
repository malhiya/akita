from types import SimpleNamespace

from group_merge import merge_grouped
from models import Occurrence
from suggestions import MAX_CANDIDATES, free_slots, pick_mover, suggest_fix

D = "2026-10-21"


def occ(task_id, pet, name, time, dur=30, priority="high", category="walk", group_id=None):
    return Occurrence(
        task_id=task_id, pet_id=task_id, pet_name=pet, name=name, category=category,
        priority=priority, occurs_on=D, time=time, duration_minutes=dur,
        group_id=group_id, pet_names=[pet], task_ids=[task_id],
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


GOOD = '{"time": "09:00", "reason": "Keeps the bath in the morning."}'


def walk_and_bath():
    """Kat's walk (high) 08:00-08:30 overlaps Max's bath (medium) 08:15-08:45."""
    a = occ(1, "Kat", "walk", "08:00", priority="high")
    b = occ(2, "Max", "bath", "08:15", priority="medium", category="grooming")
    return a, b


# ---- who moves -------------------------------------------------------------

def test_lower_priority_event_moves():
    a, b = walk_and_bath()
    assert pick_mover(a, b)[0] is b
    assert pick_mover(b, a)[0] is b  # order of the arguments doesn't matter


def test_two_non_negotiable_events_cannot_be_resolved():
    a = occ(1, "Kat", "insulin", "08:00", priority="non-negotiable")
    b = occ(2, "Max", "meds", "08:10", priority="non-negotiable")
    assert pick_mover(a, b) is None


def test_equal_priority_moves_the_later_event():
    a = occ(1, "Kat", "walk", "08:00")
    b = occ(2, "Max", "walk", "08:15")
    assert pick_mover(a, b)[0] is b
    assert pick_mover(b, a)[0] is b


# ---- free slots ------------------------------------------------------------

def test_free_slots_prefer_the_closest_times():
    slots = free_slots(30, [(480, 510)], "08:15")  # busy 08:00-08:30
    assert slots[0] == "08:30"
    assert "08:00" not in slots and "08:15" not in slots


def test_free_slots_stay_inside_the_daytime_window():
    slots = free_slots(60, [], "21:00")  # a 60 minute task must end by 22:00
    assert slots and all("06:00" <= s <= "20:45" for s in slots)


def test_free_slots_never_include_the_original_time():
    assert "08:00" not in free_slots(30, [], "08:00")


def test_free_slots_are_limited():
    assert len(free_slots(30, [], "12:00")) == MAX_CANDIDATES


def test_free_slots_none_when_the_day_is_full():
    assert free_slots(30, [(360, 1320)], "08:00") == []


# ---- the suggestion --------------------------------------------------------

def test_ai_choice_from_the_offered_slots_is_used():
    a, b = walk_and_bath()
    s = suggest_fix(FakeClient(GOOD), a, b, [a, b])
    assert s.source == "ai" and s.new_time == "09:00"
    assert s.move_task_ids == [2] and s.old_time == "08:15"
    assert s.task_name == "bath" and s.pet_names == ["Max"]
    assert s.notice is None


def test_ai_choice_outside_the_offered_slots_is_rejected():
    a, b = walk_and_bath()
    bad = '{"time": "10:00", "reason": "later is nicer"}'
    s = suggest_fix(FakeClient(bad), a, b, [a, b])
    assert s.source == "rule" and s.new_time == "08:30" and s.notice


def test_ai_failure_falls_back_to_the_closest_free_time():
    a, b = walk_and_bath()
    s = suggest_fix(FakeClient(error=RuntimeError("boom")), a, b, [a, b])
    assert s.source == "rule" and s.new_time == "08:30" and s.notice


def test_invalid_ai_json_falls_back():
    a, b = walk_and_bath()
    s = suggest_fix(FakeClient("Sure! Try 9am."), a, b, [a, b])
    assert s.source == "rule" and s.new_time == "08:30"


def test_no_client_falls_back_with_a_notice():
    a, b = walk_and_bath()
    s = suggest_fix(None, a, b, [a, b])
    assert s.source == "rule" and s.new_time == "08:30" and "configured" in s.notice


def test_mover_own_slot_does_not_block_itself():
    # If the bath's own 08:15-08:45 slot counted as busy, 08:30 would be rejected.
    a, b = walk_and_bath()
    assert suggest_fix(None, a, b, [a, b]).new_time == "08:30"


def test_two_non_negotiable_events_get_no_suggestion():
    a = occ(1, "Kat", "insulin", "08:00", priority="non-negotiable")
    b = occ(2, "Max", "meds", "08:10", priority="non-negotiable")
    s = suggest_fix(FakeClient(GOOD), a, b, [a, b])
    assert s.new_time is None and s.move_task_ids == []
    assert "non-negotiable" in s.reason


def test_full_day_gets_no_suggestion_and_skips_the_ai():
    a, b = walk_and_bath()
    wall = occ(3, "Luna", "vet", "06:00", dur=960, priority="non-negotiable")
    client = FakeClient(GOOD)
    s = suggest_fix(client, a, b, [a, b, wall])
    assert s.new_time is None and client.kwargs is None


def test_prompt_lists_the_candidate_slots():
    a, b = walk_and_bath()
    client = FakeClient(GOOD)
    suggest_fix(client, a, b, [a, b])
    prompt = " ".join(m["content"] for m in client.kwargs["messages"])
    assert "09:00" in prompt and "bath" in prompt
    assert client.kwargs["response_format"] == {"type": "json_object"}


def test_linked_group_moves_together():
    k = occ(1, "Kat", "walk", "08:00", priority="medium", group_id="g")
    m = occ(2, "Max", "walk", "08:00", priority="medium", group_id="g")
    group = merge_grouped([k, m])[0]
    other = occ(3, "Luna", "walk", "08:15", priority="high")
    s = suggest_fix(None, group, other, [k, m, other])
    assert s.move_task_ids == [1, 2] and s.pet_names == ["Kat", "Max"]