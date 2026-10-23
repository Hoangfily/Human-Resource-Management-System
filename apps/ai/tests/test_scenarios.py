"""Offline run of every scenario with its scripted LLM answer (no network).

This checks the pipeline and guardrails produce the expected action. Decision quality
of the real LLM is measured separately with `python -m app.eval`.
"""

from dataclasses import replace

import pytest

from app.config import get_settings
from app.mock_api.fixtures import default_employee
from app.scenarios import Scenario, load_scenarios, run_scenario
from app.schemas.common import FinalAction

pytestmark = pytest.mark.anyio

SCENARIOS = load_scenarios("leave") + load_scenarios("overtime") + load_scenarios("attendance")
SETTINGS = replace(get_settings(), ai_min_confidence=0.85, ai_max_auto_leave_days=3)
WRITE_ENDPOINT = {FinalAction.APPROVE: "ai-decision", FinalAction.REJECT: "ai-decision", FinalAction.ESCALATE: "escalate"}


def test_scenarios_are_loaded() -> None:
    assert len(SCENARIOS) >= 12
    assert len({s.id for s in SCENARIOS}) == len(SCENARIOS)
    assert {s.expected_action for s in SCENARIOS} == set(FinalAction)  # Every outcome is covered


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s.id)
async def test_scenario(scenario: Scenario) -> None:
    llm = scenario.scripted_llm()
    response, store = await run_scenario(scenario, llm, SETTINGS)

    assert response.action is scenario.expected_action, response.reasons
    hint = scenario.raw["expected"].get("reason_contains")
    if hint:  # Right outcome for the right reason (not e.g. an unreadable payload)
        assert any(hint in r for r in response.reasons), response.reasons
    if scenario.expected_action is FinalAction.SKIP:
        assert store.writes == [] and llm.prompts == []
        return

    assert [w["endpoint"] for w in store.writes] == [WRITE_ENDPOINT[scenario.expected_action]]
    for system, user in llm.prompts:  # No contact details in any prompt
        for secret in (default_employee()["email"], default_employee()["phone"], default_employee()["fullName"]):
            assert secret not in system + user
