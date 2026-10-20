from datetime import date
from types import SimpleNamespace

from parse_service import MAX_LINES, parse_lines
from test_classifier import GOOD, FakeClient

TODAY = date(2026, 10, 9)
LUNA = SimpleNamespace(id=1, name="Luna", species="Dog", health_notes=None)
MAX = SimpleNamespace(id=2, name="Max", species="Dog", health_notes="diabetic")
WHISKERS = SimpleNamespace(id=3, name="Whiskers", species="Cat", health_notes=None)
PETS = [LUNA, MAX, WHISKERS]


class CountingClient(FakeClient):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.calls = 0

    def _create(self, **kwargs):
        self.calls += 1
        return super()._create(**kwargs)

class RecordingClient(FakeClient):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.prompts = []

    def _create(self, **kwargs):
        self.prompts.append(" ".join(m["content"] for m in kwargs["messages"]))
        return super()._create(**kwargs)


def test_each_nonblank_line_becomes_a_draft():
    result = parse_lines(None, PETS, "give Luna her meds at 8am\n\nwalk Max every morning\n", None, TODAY)
    assert len(result.drafts) == 2


def test_line_routes_to_the_pet_named_in_it():
    result = parse_lines(None, PETS, "give Luna her meds\nwalk Max", None, TODAY)
    assert [d.pet_id for d in result.drafts] == [1, 2]
    assert result.drafts[0].pet_name == "Luna"


def test_selected_pet_is_used_when_no_name_is_found():
    draft = parse_lines(None, PETS, "brush coat", 3, TODAY).drafts[0]
    assert draft.pet_id == 3 and draft.pet_name == "Whiskers" and not draft.needs_pet


def test_unknown_pet_is_flagged():
    draft = parse_lines(None, PETS, "brush coat", None, TODAY).drafts[0]
    assert draft.pet_id is None and draft.needs_pet


def test_line_naming_two_pets_becomes_one_draft_per_pet():
    result = parse_lines(None, PETS, "walk Luna and Max", 3, TODAY)
    assert [d.pet_id for d in result.drafts] == [1, 2]
    assert not any(d.needs_pet for d in result.drafts)
    assert result.warnings


def test_each_pet_in_a_shared_line_gets_its_own_health_notes():
    client = RecordingClient(GOOD)
    parse_lines(client, PETS, "feed Luna and Max dinner", None, TODAY)
    assert len(client.prompts) == 2
    assert "Pet health notes: none" in client.prompts[0]        # Luna
    assert "Pet health notes: diabetic" in client.prompts[1]    # Max


def test_split_drafts_share_a_group_id():
    drafts = parse_lines(None, PETS, "walk Luna and Max", None, TODAY).drafts
    assert drafts[0].group_id and drafts[0].group_id == drafts[1].group_id


def test_single_pet_lines_have_no_group_id():
    drafts = parse_lines(None, PETS, "walk Luna\nbrush coat", 3, TODAY).drafts
    assert all(d.group_id is None for d in drafts)


def test_each_split_line_gets_its_own_group_id():
    text = "walk Luna and Max\nfeed Luna and Max"
    drafts = parse_lines(None, PETS, text, None, TODAY).drafts
    assert len(drafts) == 4
    assert drafts[0].group_id == drafts[1].group_id
    assert drafts[2].group_id == drafts[3].group_id
    assert drafts[0].group_id != drafts[2].group_id


def test_pet_names_match_whole_words_only():
    pets = [SimpleNamespace(id=9, name="Al", species="Dog", health_notes=None)]
    assert parse_lines(None, pets, "give Alex meds", None, TODAY).drafts[0].needs_pet


def test_health_notes_reach_the_classifier():
    client = FakeClient(GOOD)
    parse_lines(client, PETS, "feed Max dinner", None, TODAY)
    prompt = " ".join(m["content"] for m in client.kwargs["messages"])
    assert "diabetic" in prompt


def test_draft_carries_parsed_details():
    text = "walk Max at 7:15am for 40 minutes every Saturday"
    draft = parse_lines(None, PETS, text, None, TODAY).drafts[0]
    assert draft.scheduled_time == "07:15" and draft.duration_minutes == 40
    assert (draft.frequency, draft.scheduled_day) == ("weekly", "Saturday")
    assert draft.start_date == TODAY and draft.assumed == ["start_date"]


def test_draft_source_and_citation():
    draft = parse_lines(None, PETS, "walk Max", None, TODAY).drafts[0]
    assert draft.source == "text" and draft.citation is None


def test_ai_result_lists_rules_consulted():
    draft = parse_lines(FakeClient(GOOD), PETS, "give Luna her meds at 8am", None, TODAY).drafts[0]
    assert draft.classification_source == "ai" and draft.reason == "Medication is non-negotiable."
    assert draft.rules_consulted and draft.rules_consulted[0].source == "general guidelines"


def test_ai_failure_falls_back_with_notice():
    client = FakeClient(error=RuntimeError("boom"))
    drafts = parse_lines(client, PETS, "walk Max\nbrush Luna", None, TODAY).drafts
    assert all(d.classification_source == "keyword" for d in drafts)
    assert all("keyword" in d.notice for d in drafts)


def test_outage_skips_ai_for_remaining_lines():
    client = CountingClient(error=RuntimeError("boom"))
    drafts = parse_lines(client, PETS, "walk Max\nfeed Max dinner\nbrush Luna", None, TODAY).drafts
    assert client.calls == 1
    assert len({d.notice for d in drafts}) == 1
    assert all(d.classification_source == "keyword" for d in drafts)


def test_more_than_the_line_cap_is_truncated_with_warning():
    result = parse_lines(None, PETS, "\n".join(["walk Max"] * 25), None, TODAY)
    assert len(result.drafts) == MAX_LINES
    assert result.warnings


def test_short_lines_are_skipped():
    assert len(parse_lines(None, PETS, "ok\n!!\nwalk Max", None, TODAY).drafts) == 1


def test_empty_text_gives_no_drafts_and_a_warning():
    result = parse_lines(None, PETS, "   \n  ", None, TODAY)
    assert result.drafts == [] and result.warnings