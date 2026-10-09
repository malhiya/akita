from types import SimpleNamespace

import pytest

from classifier import ClassificationError, classify_with_groq


class FakeClient:
    """Stands in for the Groq client and records what it was sent."""

    def __init__(self, content=None, error=None):
        self.content, self.error, self.kwargs = content, error, None
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.kwargs = kwargs
        if self.error:
            raise self.error
        message = SimpleNamespace(content=self.content)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


GOOD = '{"priority": "non-negotiable", "category": "meds", "reason": "Medication is non-negotiable."}'


def test_valid_response_is_parsed():
    result = classify_with_groq(FakeClient(GOOD), "give Luna her meds", "Dog")
    assert result.priority == "non-negotiable"
    assert result.category == "meds"
    assert "Medication" in result.reason


def test_invalid_priority_is_rejected():
    bad = '{"priority": "urgent", "category": "meds", "reason": "x"}'
    with pytest.raises(ClassificationError):
        classify_with_groq(FakeClient(bad), "give meds", "Dog")


def test_non_json_is_rejected():
    with pytest.raises(ClassificationError):
        classify_with_groq(FakeClient("Sure! Here you go."), "walk Max", "Dog")


def test_api_error_is_wrapped():
    with pytest.raises(ClassificationError):
        classify_with_groq(FakeClient(error=RuntimeError("boom")), "walk Max", "Dog")


def test_prompt_contains_rules_species_and_health_notes():
    client = FakeClient(GOOD)
    classify_with_groq(
        client, "feed Max", "Dog",
        health_notes="diabetic",
        rules=["[feeding] Feeding is high priority."],
    )
    prompt = " ".join(m["content"] for m in client.kwargs["messages"])
    assert "[feeding] Feeding is high priority." in prompt
    assert "Dog" in prompt
    assert "diabetic" in prompt


def test_json_mode_is_requested():
    client = FakeClient(GOOD)
    classify_with_groq(client, "walk Max", "Dog")
    assert client.kwargs["response_format"] == {"type": "json_object"}


def test_no_rules_still_classifies():
    result = classify_with_groq(FakeClient(GOOD), "do the thing", "Cat", rules=[])
    assert result.category == "meds"