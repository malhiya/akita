import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from classifier import classify_task
from models import Category, Frequency, Priority
from retrieval import RetrievedRule
from task_parser import fill_defaults, parse_details

MAX_LINES = 20


class ParseRequest(BaseModel):
    owner_id: int
    text: str = Field(min_length=1, max_length=2000)
    pet_id: int | None = None
    today: date | None = None  # the user's local date; the server's can differ


class TaskDraft(BaseModel):
    line: str
    name: str
    pet_id: int | None
    pet_name: str | None
    needs_pet: bool
    category: Category
    priority: Priority
    reason: str
    classification_source: Literal["ai", "keyword"]
    notice: str | None
    rules_consulted: list[RetrievedRule]
    duration_minutes: int
    scheduled_time: str
    frequency: Frequency
    scheduled_day: str | None
    start_date: date
    end_date: date | None = None
    assumed: list[str]
    source: Literal["text"] = "text"   # "document" if file import is ever added
    citation: str | None = None


class ParseResponse(BaseModel):
    drafts: list[TaskDraft]
    warnings: list[str] = []


def _pets_named_in(line: str, pets) -> list:
    return [p for p in pets if re.search(rf"\b{re.escape(p.name)}\b", line, re.IGNORECASE)]


def parse_lines(client, pets, text: str, selected_pet_id: int | None, today: date) -> ParseResponse:
    """Turn freeform text into task drafts. Saves nothing."""
    by_id = {p.id: p for p in pets}
    lines = [ln.strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if sum(c.isalnum() for c in ln) >= 3]

    warnings: list[str] = []
    if not lines:
        return ParseResponse(drafts=[], warnings=["No task lines found."])
    if len(lines) > MAX_LINES:
        warnings.append(f"Only the first {MAX_LINES} lines were processed.")
        lines = lines[:MAX_LINES]

    drafts: list[TaskDraft] = []
    ai_notice = None  # set after the first AI failure, so we stop calling it

    for line in lines:
        named = _pets_named_in(line, pets)
        pet = None
        if len(named) == 1:
            pet = named[0]
        elif len(named) > 1:
            warnings.append(f'"{line}" mentions several pets; choose one.')
        elif selected_pet_id is not None:
            pet = by_id.get(selected_pet_id)

        result = classify_task(
            None if ai_notice else client,
            line,
            pet.species if pet else "unknown",
            pet.health_notes if pet else None,
        )
        if ai_notice:
            result.notice = ai_notice
        elif client is not None and result.source == "keyword":
            ai_notice = result.notice

        details = fill_defaults(parse_details(line, today), result.category, today)
        drafts.append(TaskDraft(
            line=line,
            name=line[:100],
            pet_id=pet.id if pet else None,
            pet_name=pet.name if pet else None,
            needs_pet=pet is None,
            category=result.category,
            priority=result.priority,
            reason=result.reason,
            classification_source=result.source,
            notice=result.notice,
            rules_consulted=result.retrieved,
            duration_minutes=details.duration_minutes,
            scheduled_time=details.scheduled_time,
            frequency=details.frequency,
            scheduled_day=details.scheduled_day,
            start_date=details.start_date,
            assumed=details.assumed,
        ))

    return ParseResponse(drafts=drafts, warnings=warnings)