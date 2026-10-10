from retrieval import RetrievedRule, retrieve_rules


def test_medication_line_retrieves_medication_rule():
    rules = retrieve_rules("give Luna her meds at 8am")
    assert any("[medication]" in r.text for r in rules)


def test_unrelated_rules_not_retrieved():
    rules = retrieve_rules("give Luna her meds at 8am")
    assert not any("[grooming]" in r.text for r in rules)


def test_walk_line():
    rules = retrieve_rules("walk Max every morning")
    tags = " ".join(r.text for r in rules)
    assert "[walk]" in tags and "[time]" in tags


def test_health_notes_pull_in_health_rule():
    rules = retrieve_rules("feed Max", health_notes="diabetic")
    assert any("[health]" in r.text for r in rules)


def test_no_match_returns_empty():
    assert retrieve_rules("xyzzy") == []


def test_matching_is_case_insensitive():
    assert any("[vet]" in r.text for r in retrieve_rules("VET appointment Thursday"))


def test_rules_are_structured():
    rules = retrieve_rules("give Luna her medication at 8am")
    assert rules and all(isinstance(r, RetrievedRule) for r in rules)


def test_rules_carry_source():
    rules = retrieve_rules("give Luna her medication at 8am")
    assert all(r.source == "general guidelines" for r in rules)
    assert all(r.location is None for r in rules)

def test_no_match_returns_empty():
    assert retrieve_rules("xyzzy") == []


def test_matching_is_case_insensitive():
    assert any("[vet]" in r.text for r in retrieve_rules("VET appointment Thursday"))