import re
from pathlib import Path

KB_PATH = Path(__file__).parent / "knowledge_base.md"

KEYWORDS = {
    "medication": {"med", "meds", "medication", "pill", "pills", "dose", "drops", "supplement"},
    "vet": {"vet", "veterinarian", "appointment", "checkup", "clinic", "doctor"},
    "feeding": {"feed", "food", "meal", "breakfast", "lunch", "dinner", "eat"},
    "walk": {"walk", "walking", "run", "jog", "leash", "exercise"},
    "grooming": {"groom", "bath", "bathe", "brush", "nail", "nails", "trim", "haircut"},
    "play": {"play", "toy", "fetch", "enrichment", "game"},
    "training": {"train", "training", "command", "practice", "lesson"},
    "time": {"morning", "afternoon", "evening", "night", "bedtime"},
    "health": {"diabetic", "diabetes", "kidney", "sick", "ill", "allergy", "arthritis", "health"},
}


def load_rules() -> list[str]:
    return [line.strip() for line in KB_PATH.read_text().splitlines() if line.strip()]


def retrieve_rules(task_text: str, health_notes: str | None = None) -> list[str]:
    words = set(re.findall(r"[a-z]+", task_text.lower()))
    topics = {t for t, kws in KEYWORDS.items() if words & kws}

    if health_notes:
        note_words = set(re.findall(r"[a-z]+", health_notes.lower()))
        if note_words & KEYWORDS["health"]:
            topics.add("health")

    return [r for r in load_rules() if any(r.startswith(f"[{t}]") for t in topics)]