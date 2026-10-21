import re

from models import Occurrence


def _join(names: list[str]) -> str:
    if len(names) == 1:
        return names[0]
    return ", ".join(names[:-1]) + " & " + names[-1]


def display_name(name: str, pet_names: list[str]) -> str:
    """Drop the pets' own names (and the 'and' between them) from a task name.

    'walk Kat and Max every morning' -> 'walk every morning'. If nothing would be
    left, the original name is kept.
    """
    pets = {w.lower() for p in pet_names for w in re.findall(r"[A-Za-z0-9']+", p)}
    words = name.split()
    is_pet = [re.sub(r"[^\w']", "", w).lower() in pets for w in words]
    kept = []
    for i, w in enumerate(words):
        if is_pet[i]:
            continue
        glue = w.lower().strip(",") in {"and", "&"}
        near_pet = (i > 0 and is_pet[i - 1]) or (i + 1 < len(words) and is_pet[i + 1])
        if glue and near_pet:
            continue
        kept.append(w)
    return " ".join(kept) or name


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

    for o in merged:
        if len(o.pet_names) > 1:   # the pets are listed in the title, so don't repeat them in the name
            o.name = display_name(o.name, o.pet_names)
    return merged