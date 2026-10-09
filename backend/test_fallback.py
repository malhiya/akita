from classifier import ClassificationResult, classify_task, keyword_classify
from test_classifier import GOOD, FakeClient


def test_keyword_medication():
    assert keyword_classify("give Luna her meds at 8am")[:2] == ("meds", "non-negotiable")


def test_keyword_vet():
    assert keyword_classify("vet appointment Thursday")[:2] == ("vet", "non-negotiable")


def test_keyword_walk():
    assert keyword_classify("walk Max every morning")[:2] == ("walk", "high")


def test_keyword_grooming():
    assert keyword_classify("brush Whiskers")[:2] == ("grooming", "medium")


def test_keyword_play():
    assert keyword_classify("play fetch with Rex")[:2] == ("play", "low")


def test_keyword_training():
    assert keyword_classify("training session for Rex")[:2] == ("training", "low")


def test_keyword_unknown_is_general_medium():
    assert keyword_classify("do the morning thing")[:2] == ("general", "medium")


def test_medication_beats_feeding():
    assert keyword_classify("feed Max his pills")[0] == "meds"


def test_health_notes_raise_feeding_priority():
    assert keyword_classify("feed Max", health_notes="diabetic")[:2] == ("feeding", "non-negotiable")


def test_health_notes_do_not_raise_walk():
    assert keyword_classify("walk Max", health_notes="diabetic")[:2] == ("walk", "high")


def test_ai_result_has_no_notice():
    result = classify_task(FakeClient(GOOD), "give Luna her meds", "Dog")
    assert isinstance(result, ClassificationResult)
    assert result.source == "ai" and result.notice is None


def test_api_error_falls_back_with_notice():
    result = classify_task(FakeClient(error=RuntimeError("boom")), "walk Max", "Dog")
    assert result.source == "keyword"
    assert "keyword" in result.notice
    assert result.category == "walk"


def test_invalid_ai_output_falls_back():
    bad = '{"priority": "urgent", "category": "meds", "reason": "x"}'
    assert classify_task(FakeClient(bad), "give meds", "Dog").source == "keyword"


def test_missing_client_falls_back():
    result = classify_task(None, "give meds", "Dog")
    assert result.source == "keyword" and result.notice