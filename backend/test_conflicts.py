from datetime import date

from conflicts import detect_conflicts
from group_merge import merge_grouped
from models import Occurrence, Task

D = date(2026, 10, 21)
DAILY = "FREQ=DAILY"


def make(task_id, pet_id, pet, name="walk", category="walk", time="08:00", dur=30,
         priority="high", group_id=None, rrule=DAILY, day=D):
    task = Task(
        id=task_id, pet_id=pet_id, name=name, category=category, priority=priority,
        duration_minutes=dur, scheduled_time=time, start_date=date(2026, 10, 19),
        rrule=rrule, group_id=group_id,
    )
    occ = Occurrence(
        task_id=task_id, pet_id=pet_id, pet_name=pet, name=name, category=category,
        priority=priority, occurs_on=day, time=time, duration_minutes=dur,
        group_id=group_id, pet_names=[pet], task_ids=[task_id],
    )
    return occ, task


def run(*pairs):
    occs = merge_grouped([o for o, _ in pairs])
    tasks = {t.id: t for _, t in pairs}
    return detect_conflicts(occs, tasks)


def test_different_times_do_not_conflict():
    assert run(make(1, 1, "Kat", time="08:00"), make(2, 2, "Max", name="bath", time="09:00")) == []


def test_back_to_back_tasks_do_not_conflict():
    assert run(make(1, 1, "Kat", time="08:00", dur=30), make(2, 2, "Max", name="bath", time="08:30")) == []


def test_partial_overlap_reports_minutes():
    out = run(make(1, 1, "Kat", time="08:00"), make(2, 2, "Max", name="bath", time="08:15"))
    assert len(out) == 1
    assert out[0].kind == "overlap" and out[0].overlap_minutes == 15


def test_linked_pets_at_the_same_time_are_not_a_conflict():
    assert run(make(1, 1, "Kat", group_id="g"), make(2, 2, "Max", group_id="g")) == []


def test_linked_pets_edited_to_overlapping_different_times_do_conflict():
    out = run(make(1, 1, "Kat", time="08:00", group_id="g"), make(2, 2, "Max", time="08:15", group_id="g"))
    assert len(out) == 1 and out[0].kind == "overlap"


def test_identical_task_for_different_pets_is_flagged_identical():
    out = run(make(1, 1, "Kat"), make(2, 2, "Max"))
    assert len(out) == 1 and out[0].kind == "identical"


def test_identical_but_different_recurrence_is_only_an_overlap():
    out = run(make(1, 1, "Kat"), make(2, 2, "Max", rrule="FREQ=WEEKLY;BYDAY=WE"))
    assert out[0].kind == "overlap"


def test_identical_but_different_priority_is_only_an_overlap():
    out = run(make(1, 1, "Kat", priority="high"), make(2, 2, "Max", priority="medium"))
    assert out[0].kind == "overlap"


def test_same_pet_twice_is_a_duplicate():
    out = run(make(1, 1, "Kat"), make(2, 1, "Kat"))
    assert len(out) == 1 and out[0].kind == "duplicate"


def test_ungrouped_copy_matches_a_linked_group():
    out = run(
        make(1, 1, "Kat", group_id="g"), make(2, 2, "Max", group_id="g"),
        make(3, 3, "Luna"),
    )
    assert len(out) == 1 and out[0].kind == "identical"
    assert sorted([len(out[0].a.task_ids), len(out[0].b.task_ids)]) == [1, 2]


def test_a_linked_group_overlapping_one_task_is_a_single_conflict():
    out = run(
        make(1, 1, "Kat", group_id="g"), make(2, 2, "Max", group_id="g"),
        make(3, 3, "Luna", name="brush", category="grooming", time="08:10"),
    )
    assert len(out) == 1
    assert out[0].overlap_minutes == 20


def test_repeating_conflict_is_collapsed_with_all_its_dates():
    d2 = date(2026, 10, 22)
    out = run(
        make(1, 1, "Kat", day=D), make(2, 2, "Max", name="bath", time="08:10", day=D),
        make(1, 1, "Kat", day=d2), make(2, 2, "Max", name="bath", time="08:10", day=d2),
    )
    assert len(out) == 1
    assert out[0].dates == [D, d2]


def test_overlap_across_midnight_is_found():
    out = run(
        make(1, 1, "Kat", name="meds", category="meds", time="23:45", day=D),
        make(2, 2, "Max", name="bath", time="00:00", day=date(2026, 10, 22)),
    )
    assert len(out) == 1 and out[0].overlap_minutes == 15


def test_same_time_on_different_days_is_not_a_conflict():
    assert run(make(1, 1, "Kat", day=D), make(2, 2, "Max", name="bath", day=date(2026, 10, 22))) == []