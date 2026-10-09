from retrieval import retrieve_rules


def test_medication_line_retrieves_medication_rule():
    rules = retrieve_rules("give Luna her meds at 8am")
    assert any("[medication]" in r for r in rules)


def test_unrelated_rules_not_retrieved():
    rules = retrieve_rules("give Luna her meds at 8am")
    assert not any("[grooming]" in r for r in rules)


def test_walk_line():
    rules = retrieve_rules("walk Max every morning")
    tags = " ".join(rules)
    assert "[walk]" in tags and "[time]" in tags


def test_health_notes_pull_in_health_rule():
    rules = retrieve_rules("feed Max", health_notes="diabetic")
    assert any("[health]" in r for r in rules)


def test_no_match_returns_empty():
    assert retrieve_rules("xyzzy") == []


def test_matching_is_case_insensitive():
    assert any("[vet]" in r for r in retrieve_rules("VET appointment Thursday"))