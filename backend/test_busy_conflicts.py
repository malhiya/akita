from datetime import date

from conflicts import busy_occurrence, busy_overlaps, detect_conflicts
from group_merge import merge_grouped
from models import Occurrence, Task

D = date(2026, 10, 21)
D2 = date(2026, 10, 22)


def make(task_id, pet_id, pet, name="walk", category="walk", time="08:00", dur=30,
         priority="high", group_id=None, rrule="FREQ=DAILY", day=D):
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


def run(pairs, busy):
    occs = merge_grouped([o for o, _ in pairs])
    tasks = {t.id: t for _, t in pairs}
    return detect_conflicts(occs, tasks, busy)


# ---- busy_overlaps ----------------------------------------------------------

def test_overlap_with_a_busy_piece_reports_minutes():
    walk, _ = make(1, 1, "Kat", time="08:00")                      # 08:00-08:30
    assert busy_overlaps(walk, [(D, 495, 600)]) == [(D, 495, 600, 15)]  # busy 08:15-10:00


def test_adjacent_busy_time_is_not_an_overlap():
    walk, _ = make(1, 1, "Kat", time="08:00")
    assert busy_overlaps(walk, [(D, 510, 600)]) == []              # busy starts as the walk ends


def test_busy_time_on_another_day_is_ignored():
    walk, _ = make(1, 1, "Kat", time="08:00")
    assert busy_overlaps(walk, [(D2, 480, 540)]) == []


def test_an_event_running_past_midnight_meets_early_morning_busy_time():
    late, _ = make(1, 1, "Kat", time="23:45", dur=30)              # 23:45-00:15
    assert busy_overlaps(late, [(D2, 0, 60)]) == [(D2, 0, 60, 15)]


# ---- detect_conflicts with a calendar --------------------------------------

def test_no_calendar_means_no_busy_conflicts():
    assert run([make(1, 1, "Kat")], None) == []
    assert run([make(1, 1, "Kat")], []) == []


def test_pet_event_overlapping_the_calendar_is_a_busy_conflict():
    out = run([make(1, 1, "Kat", time="08:00")], [(D, 495, 600)])
    assert len(out) == 1
    c = out[0]
    assert c.kind == "busy" and c.overlap_minutes == 15
    assert c.a.task_ids == [1] and c.b.task_ids == []
    assert c.b.pet_name == "Your calendar" and c.b.time == "08:15"


def test_the_calendar_stand_in_carries_no_title():
    b = busy_occurrence(D, 495, 600)
    assert b.name == "Busy" and b.task_ids == [] and b.duration_minutes == 105


def test_a_repeating_clash_is_one_conflict_with_all_dates():
    pairs = [make(1, 1, "Kat", day=D), make(1, 1, "Kat", day=D2)]
    out = run(pairs, [(D, 480, 540), (D2, 480, 540)])
    assert len(out) == 1 and out[0].dates == [D, D2]


def test_an_event_overlapping_two_busy_blocks_is_still_one_conflict():
    out = run([make(1, 1, "Kat", time="08:00", dur=120)], [(D, 480, 500), (D, 540, 560)])
    assert len(out) == 1 and out[0].overlap_minutes == 40


def test_a_linked_group_clashing_with_the_calendar_is_one_conflict():
    pairs = [make(1, 1, "Kat", group_id="g"), make(2, 2, "Max", group_id="g")]
    out = run(pairs, [(D, 480, 540)])
    assert len(out) == 1 and sorted(out[0].a.task_ids) == [1, 2]


def test_pet_conflicts_and_calendar_conflicts_are_both_reported():
    pairs = [make(1, 1, "Kat", time="08:00"), make(2, 2, "Max", name="bath", category="grooming", time="08:15")]
    out = run(pairs, [(D, 480, 510)])
    assert sorted(c.kind for c in out) == ["busy", "busy", "overlap"]


def test_a_free_event_is_not_reported():
    assert run([make(1, 1, "Kat", time="08:00")], [(D, 600, 660)]) == []