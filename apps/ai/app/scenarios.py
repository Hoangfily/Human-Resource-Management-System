"""Evaluation scenarios: synthetic requests with the decision a careful HR officer would make.

Used twice:
- tests/test_scenarios.py runs them offline with the scripted `llm` answer (pipeline + guards).
- app/eval.py runs the `live` ones against the real LLM to measure decision quality.

Scenario file (tests/scenarios/<type>/*.json):
{
  "id": "...", "description": "...", "today": "YYYY-MM-DD", "live": true,
  "request": {...},            # merged into the demo request (payload is merged too)
  "employee": {...},           # merged into the default employee
  "history": [{...}],          # other requests of the employee (short form, see _history_request)
  "autonomy": {"LEAVE": "AUTO_APPROVE_LOW_RISK"},
  "llm": {LLMAssessment} | {"error": "..."},
  "expected": {"action": "APPROVE" | "REJECT" | "ESCALATE" | "SKIP"}
}
"""

import json
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

import httpx

from .agents.supervisor import EvaluationDeps, evaluate_request
from .config import Settings
from .llm import LLMClient, LLMError
from .llm.fake import FakeLLM
from .mock_api.fixtures import MockStore, default_employee, demo_store
from .mock_api.server import create_mock_api
from .schemas.common import FinalAction
from .schemas.decision import EvaluateResponse, LLMAssessment
from .tools.base import ApiClient

SCENARIO_DIR = Path(__file__).resolve().parent.parent / "tests" / "scenarios"
REQUEST_ID = "req-demo-1"


@dataclass(frozen=True)
class Scenario:
    id: str
    description: str
    today: date
    live: bool
    expected_action: FinalAction
    raw: dict[str, Any] = field(repr=False)

    def build_store(self) -> MockStore:
        store = demo_store()
        employee = default_employee() | self.raw.get("employee", {})
        store.add_employee(employee)

        request = deepcopy(store.requests[REQUEST_ID])
        overrides = deepcopy(self.raw.get("request", {}))
        request["payload"] |= overrides.pop("payload", {})
        request |= overrides
        store.add_request(request)

        for i, item in enumerate(self.raw.get("history", [])):
            store.add_request(_history_request(f"hist-{i}", item))
        for request_type, level in self.raw.get("autonomy", {}).items():
            store.autonomy[request_type]["level"] = level
        return store

    def scripted_llm(self) -> FakeLLM:
        answer = self.raw["llm"]
        if "error" in answer:
            return FakeLLM([LLMError(answer["error"])])
        return FakeLLM([LLMAssessment.model_validate(answer)])


def _history_request(request_id: str, item: dict[str, Any]) -> dict[str, Any]:
    """Short form: {"leaveTypeId", "startDate", "endDate", "days", "status", "createdAt"}."""
    return {
        "id": request_id,
        "type": item.get("type", "LEAVE"),
        "status": item.get("status", "APPROVED"),
        "employeeId": "emp-001",
        "payload": {
            "leaveTypeId": item["leaveTypeId"],
            "startDate": item["startDate"],
            "endDate": item.get("endDate", item["startDate"]),
            "reason": item.get("reason", "(lý do cũ)"),
        },
        "computed": {"daysRequested": item.get("days", 1)},
        "attachments": [],
        "createdAt": item.get("createdAt", f"{item['startDate']}T01:00:00Z"),
        "updatedAt": item.get("createdAt", f"{item['startDate']}T01:00:00Z"),
    }


def load_scenarios(request_type: str = "leave", directory: Path = SCENARIO_DIR) -> list[Scenario]:
    scenarios = []
    for path in sorted((directory / request_type).glob("*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        scenarios.append(
            Scenario(
                id=raw["id"],
                description=raw["description"],
                today=date.fromisoformat(raw["today"]),
                live=raw.get("live", True),
                expected_action=FinalAction(raw["expected"]["action"]),
                raw=raw,
            )
        )
    return scenarios


async def run_scenario(scenario: Scenario, llm: LLMClient, settings: Settings) -> tuple[EvaluateResponse, MockStore]:
    """Evaluate the scenario's request against a fresh in-process mock API."""
    store = scenario.build_store()
    transport = httpx.ASGITransport(app=create_mock_api(store))
    async with ApiClient("http://mock", store.token, transport=transport, backoff_s=0) as api:
        deps = EvaluationDeps(api=api, llm=llm, settings=settings, today=scenario.today)
        response = await evaluate_request(REQUEST_ID, deps)
    return response, store
