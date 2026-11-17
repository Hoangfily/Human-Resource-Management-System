"""Chat eval scenarios load and are scored correctly (the live run is `python -m app.eval_chat`)."""

import pytest

from app.agents.chat_drafts import REQUIRED
from app.eval_chat import check, load_chat_scenarios
from app.schemas.chat import ActionCardData, ChatActionCard, ChatResponse

INTENTS = {"POLICY_QUESTION", "LEAVE_BALANCE", "REQUEST_STATUS", "CREATE_REQUEST", "SMALL_TALK", "OUT_OF_SCOPE"}
SCENARIOS = load_chat_scenarios()


def test_there_are_chat_scenarios_with_safety_cases() -> None:
    assert len(SCENARIOS) >= 20
    assert len({s.id for s in SCENARIOS}) == len(SCENARIOS)
    assert sum(bool(s.expected.get("safety")) for s in SCENARIOS) >= 4


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s.id)
def test_scenario_is_well_formed(scenario) -> None:
    assert scenario.turns and all(isinstance(t, str) and t for t in scenario.turns)
    assert set(scenario.expected.get("intent", [])) <= INTENTS
    card = scenario.expected.get("card")
    if card:
        assert card["requestType"] in REQUIRED


def response(card_payload: dict | None = None, reply: str = "ok", citations: list[str] | None = None) -> ChatResponse:
    card = None
    if card_payload is not None:
        data = ActionCardData(type_name="x", dates="x", duration_text="x", reason="x")
        card = ChatActionCard(id="c", title="t", request_type="LEAVE", data=data, payload=card_payload, risk_level="LOW")
    return ChatResponse(conversation_id="c", reply=reply, citation_keys=citations or [], action_card=card)


def test_check_compares_only_listed_payload_keys() -> None:
    want = {"card": {"requestType": "LEAVE", "payload": {"startDate": "2026-11-05"}}}
    assert check(want, response({"startDate": "2026-11-05", "reason": "bất kỳ"}), "CREATE_REQUEST") == []
    assert check(want, response({"startDate": "2026-11-06"}), "CREATE_REQUEST") == ["payload.startDate = '2026-11-06', expected '2026-11-05'"]
    assert check(want, response(None), "CREATE_REQUEST") == ["no card"]


def test_check_reply_citations_and_intent() -> None:
    want = {"intent": ["POLICY_QUESTION"], "card": None, "citations_include": ["A.B"], "reply_not_contains": ["77"]}
    assert check(want, response(reply="Bạn còn 77 ngày"), "LEAVE_BALANCE") == [
        "intent LEAVE_BALANCE, expected POLICY_QUESTION",
        "missing citation A.B",
        "reply has “77”",
    ]
    assert "unexpected card" in check(want, response({"x": 1}, citations=["A.B"]), "POLICY_QUESTION")[0]
