from datetime import date

from models import Occurrence
from group_merge import merge_grouped


def occ(task_id, pet, group_id=None, day=date(2026, 10, 21), time="08:00", name="Walk"):
    return Occurrence(
        task_id=task_id, pet_id=task_id, pet_name=pet, name=name,
        category="walk", priority="high", occurs_on=day, time=time,
        duration_minutes=30, group_id=group_id,
    )


def test_ungrouped_occurrences_pass_through_with_lists_filled():
    out = merge_grouped([occ(1, "Kat"), occ(2, "Max")])
    assert len(out) == 2
    assert out[0].pet_names == ["Kat"] and out[0].task_ids == [1]


def test_same_group_same_day_and_time_merges_into_one():
    out = merge_grouped([occ(1, "Kat", "g1"), occ(2, "Max", "g1")])
    assert len(out) == 1
    assert out[0].pet_names == ["Kat", "Max"]
    assert out[0].task_ids == [1, 2]
    assert out[0].pet_name == "Kat & Max"
    assert out[0].task_id == 1


def test_three_pets_read_naturally():
    out = merge_grouped([occ(1, "Kat", "g"), occ(2, "Luna", "g"), occ(3, "Max", "g")])
    assert out[0].pet_name == "Kat, Luna & Max"


def test_same_group_different_days_do_not_merge():
    out = merge_grouped([
        occ(1, "Kat", "g1", day=date(2026, 10, 21)),
        occ(2, "Max", "g1", day=date(2026, 10, 21)),
        occ(1, "Kat", "g1", day=date(2026, 10, 22)),
        occ(2, "Max", "g1", day=date(2026, 10, 22)),
    ])
    assert len(out) == 2
    assert {o.occurs_on for o in out} == {date(2026, 10, 21), date(2026, 10, 22)}


def test_one_pet_edited_to_another_time_stays_separate():
    out = merge_grouped([occ(1, "Kat", "g1", time="08:00"), occ(2, "Max", "g1", time="09:00")])
    assert len(out) == 2


def test_different_groups_at_same_time_do_not_merge():
    out = merge_grouped([occ(1, "Kat", "g1"), occ(2, "Max", "g2")])
    assert len(out) == 2


def test_grouped_and_ungrouped_at_same_time_do_not_merge():
    out = merge_grouped([occ(1, "Kat", "g1"), occ(2, "Max", None)])
    assert len(out) == 2


def test_order_follows_first_appearance():
    out = merge_grouped([occ(1, "Kat", None, time="07:00"), occ(2, "Kat", "g", time="08:00"), occ(3, "Max", "g", time="08:00")])
    assert [o.task_id for o in out] == [1, 2]


def test_single_pet_group_survives_a_pet_filter():
    # when the calendar is filtered to one pet, only one half of the group comes back
    out = merge_grouped([occ(2, "Max", "g1")])
    assert out[0].pet_name == "Max" and out[0].task_ids == [2]


from group_merge import display_name


def test_merged_event_drops_each_pets_own_name_from_the_task_name():
    out = merge_grouped([
        occ(1, "Kat", "g1", name="walk Kat every morning"),
        occ(2, "Max", "g1", name="walk Max every morning"),
    ])
    assert len(out) == 1
    assert out[0].name == "walk every morning"
    assert out[0].pet_name == "Kat & Max"


def test_a_line_naming_both_pets_loses_the_dangling_and():
    out = merge_grouped([
        occ(1, "Kat", "g1", name="walk Kat and Max every morning"),
        occ(2, "Max", "g1", name="walk Kat and Max every morning"),
    ])
    assert out[0].name == "walk every morning"


def test_names_without_pet_names_are_left_alone():
    out = merge_grouped([occ(1, "Kat", "g1", name="walk the dogs"), occ(2, "Max", "g1", name="walk the dogs")])
    assert out[0].name == "walk the dogs"


def test_a_single_pet_event_keeps_its_full_name():
    out = merge_grouped([occ(1, "Kat", None, name="walk Kat every morning")])
    assert out[0].name == "walk Kat every morning"


def test_display_name_never_returns_an_empty_name():
    assert display_name("Kat", ["Kat"]) == "Kat"