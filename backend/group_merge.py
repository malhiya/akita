from models import Occurrence


def _join(names: list[str]) -> str:
    if len(names) == 1:
        return names[0]
    return ", ".join(names[:-1]) + " & " + names[-1]


def merge_grouped(occurrences: list[Occurrence]) -> list[Occurrence]:
    """Collapse occurrences from one multi-pet line into a single event.

    Two occurrences merge only if they share group_id AND date AND time, so a
    pet whose task was edited individually drops out of the merged event.
    """
    merged: list[Occurrence] = []
    seen: dict[tuple, Occurrence] = {}
    for o in occurrences:
        key = (o.group_id, o.occurs_on, o.time) if o.group_id else None
        first = seen.get(key) if key else None
        if first is None:
            first = o.model_copy(update={"pet_names": [o.pet_name], "task_ids": [o.task_id]})
            merged.append(first)
            if key:
                seen[key] = first
        else:
            first.pet_names.append(o.pet_name)
            first.task_ids.append(o.task_id)
            first.pet_name = _join(first.pet_names)
    return merged