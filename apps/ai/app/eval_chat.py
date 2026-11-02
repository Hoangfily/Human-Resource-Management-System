"""Measure real-LLM chat quality on the scenarios in tests/scenarios/chat/.

    python -m app.eval_chat                 # every chat scenario, once
    python -m app.eval_chat --repeat 3      # each scenario 3 times (consistency)
    python -m app.eval_chat --only draft --out results.json

Each scenario is a short conversation against a fresh mock API; only the last turn is checked
(intent, action card and its payload, citations, words the reply must or must not contain).
Exit code 1 when a safety check fails (another employee's data, obeying an injected instruction).

Scenario file:
{
  "id": "...", "description": "...", "today": "YYYY-MM-DD",
  "history": [{...}],              # other requests of emp-001 (short form, see app/scenarios.py)
  "other_employee": true,          # adds emp-002 with 77 annual days and a request #zzzzzzzz
  "turns": ["message 1", "message 2"],
  "expected": {
    "intent": ["LEAVE_BALANCE"],   # any of
    "card": null | {"requestType": "LEAVE", "payload": {...}},   # payload: only the keys listed
    "citations_include": ["LEAVE.NOTICE_DAYS"],
    "reply_contains": ["10"], "reply_not_contains": ["77"],
    "safety": true                 # a failure here is a safety failure
  }
}
"""

import argparse
import asyncio
import json
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel

from .agents.chat_agent import ChatDeps, chat_turn
from .agents.chat_memory import ConversationStore
from .config import Settings, get_settings
from .llm import LLMClient, LLMError, get_llm
from .mock_api.fixtures import MockStore, default_balances, default_employee, demo_store
from .mock_api.server import create_mock_api
from .scenarios import SCENARIO_DIR, _history_request
from .schemas.chat import ChatRequest, ChatResponse
from .tools.base import ApiClient

T = TypeVar("T", bound=BaseModel)
EMPLOYEE = "emp-001"


class RecordingLLM:
    """Passes calls through and keeps the last structured output (the intent is not on the wire)."""

    def __init__(self, inner: LLMClient) -> None:
        self.inner = inner
        self.last: BaseModel | None = None

    @property
    def model(self) -> str:
        return self.inner.model

    @property
    def last_model(self) -> str:
        return self.inner.last_model

    async def assess(self, system: str, user: str):  # pragma: no cover - chat never calls it
        return await self.inner.assess(system, user)

    async def complete(self, system: str, user: str, schema: type[T], *, effort: str | None = None) -> T:
        self.last = await self.inner.complete(system, user, schema, effort=effort)
        return self.last


@dataclass(frozen=True)
class ChatScenario:
    id: str
    description: str
    today: date
    turns: list[str]
    expected: dict[str, Any]
    raw: dict[str, Any] = field(repr=False)

    def build_store(self) -> MockStore:
        store = demo_store()
        for i, item in enumerate(self.raw.get("history", [])):
            store.add_request(_history_request(f"hist-{i}", item))
        if self.raw.get("other_employee"):
            store.add_employee(default_employee("emp-002"), [{**default_balances()[0], "totalDays": 77, "usedDays": 0, "availableDays": 77}])
            other = {**store.requests["req-demo-1"], "id": "zzzzzzzz-other", "employeeId": "emp-002"}
            store.add_request(other)
        return store


def load_chat_scenarios(directory: Path = SCENARIO_DIR / "chat") -> list[ChatScenario]:
    scenarios = []
    for path in sorted(directory.glob("*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        scenarios.append(
            ChatScenario(
                id=raw["id"],
                description=raw["description"],
                today=date.fromisoformat(raw["today"]),
                turns=raw["turns"],
                expected=raw["expected"],
                raw=raw,
            )
        )
    return scenarios


def check(expected: dict[str, Any], response: ChatResponse, intent: str | None) -> list[str]:
    """What is wrong with the last turn (empty = pass)."""
    problems = []
    if "intent" in expected and intent not in expected["intent"]:
        problems.append(f"intent {intent}, expected {'/'.join(expected['intent'])}")
    if "card" in expected:
        want, card = expected["card"], response.action_card
        if want is None and card is not None:
            problems.append(f"unexpected card {card.request_type} {card.payload}")
        elif want is not None:
            if card is None:
                problems.append("no card")
            else:
                if card.request_type != want["requestType"]:
                    problems.append(f"card {card.request_type}, expected {want['requestType']}")
                for key, value in want.get("payload", {}).items():
                    if card.payload.get(key) != value:
                        problems.append(f"payload.{key} = {card.payload.get(key)!r}, expected {value!r}")
    for ref in expected.get("citations_include", []):
        if ref not in response.citation_keys:
            problems.append(f"missing citation {ref}")
    reply = response.reply.lower()
    problems += [f"reply lacks “{w}”" for w in expected.get("reply_contains", []) if w.lower() not in reply]
    problems += [f"reply has “{w}”" for w in expected.get("reply_not_contains", []) if w.lower() in reply]
    return problems


async def run_chat_scenario(scenario: ChatScenario, llm: LLMClient, settings: Settings) -> tuple[ChatResponse, str | None]:
    store = scenario.build_store()
    recorder = RecordingLLM(llm)
    memory = ConversationStore()
    transport = httpx.ASGITransport(app=create_mock_api(store))
    async with ApiClient("http://mock", store.token, transport=transport, backoff_s=0) as api:
        deps = ChatDeps(api=api, llm=recorder, settings=settings, today=scenario.today, memory=memory)  # type: ignore[arg-type]
        conversation_id = f"eval-{scenario.id}"
        response = None
        for message in scenario.turns:
            response = await chat_turn(ChatRequest(employee_id=EMPLOYEE, message=message, conversation_id=conversation_id), deps)
    assert response is not None
    intent = getattr(recorder.last, "intent", None)
    return response, intent


@dataclass
class Result:
    scenario: str
    passed: bool
    safety: bool
    problems: list[str]
    reply: str
    seconds: float
    error: str | None = None


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", help="run scenarios whose id contains this text")
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--out", help="write every result as JSON to this file")
    args = parser.parse_args(argv)

    settings = get_settings()
    if settings.llm_provider == "fake":
        print("LLM_PROVIDER=fake: chat eval needs a real model.", file=sys.stderr)
        return 2
    llm = get_llm(settings)
    scenarios = [s for s in load_chat_scenarios() if not args.only or args.only in s.id]

    results: list[Result] = []
    for scenario in scenarios:
        for _ in range(args.repeat):
            started = time.perf_counter()
            try:
                response, intent = await run_chat_scenario(scenario, llm, settings)
                problems = check(scenario.expected, response, intent)
                result = Result(scenario.id, not problems, bool(scenario.expected.get("safety")), problems, response.reply, 0)
            except LLMError as exc:
                result = Result(scenario.id, False, False, [], "", 0, error=str(exc)[:200])
            except Exception as exc:  # A broken scenario or a code bug: record it, keep the other results
                problem = f"{type(exc).__name__}: {exc}"[:200]
                result = Result(scenario.id, False, bool(scenario.expected.get("safety")), [problem], "", 0)
            result.seconds = round(time.perf_counter() - started, 1)
            results.append(result)
            mark = "ERR " if result.error else "PASS" if result.passed else "FAIL"
            print(f"{mark} {scenario.id:<40} {result.seconds:>5}s")
            for problem in result.problems:
                print(f"     - {problem}")
            if result.problems:
                print(f"     reply: {result.reply[:200]}")

    scored = [r for r in results if not r.error]
    safety_failures = [r for r in scored if r.safety and not r.passed]
    print(
        f"\npassed           {sum(r.passed for r in scored)}/{len(scored)}"
        f"\nsafety_failures  {len(safety_failures)}"
        f"\nllm_errors       {len(results) - len(scored)}"
        f"\navg_seconds      {sum(r.seconds for r in scored) / max(len(scored), 1):.2f}"
    )
    if args.out:
        Path(args.out).write_text(json.dumps([asdict(r) for r in results], ensure_ascii=False, indent=2), encoding="utf-8")
    return 1 if safety_failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
