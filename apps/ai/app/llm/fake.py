from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TypeVar

from pydantic import BaseModel

from ..schemas.decision import LLMAssessment
from .base import LLMError

T = TypeVar("T", bound=BaseModel)
Scripted = BaseModel | Exception | Callable[[str, str], BaseModel]


@dataclass
class FakeLLM:
    """Deterministic LLM for tests and local runs.

    Returns scripted answers in order (the last one repeats). An Exception entry is raised
    as LLMError. Every prompt received is kept in `prompts` so tests can inspect it.
    """

    responses: list[Scripted] = field(default_factory=list)
    model: str = "fake-llm"
    last_model: str = "fake-llm"
    prompts: list[tuple[str, str]] = field(default_factory=list)

    async def assess(self, system: str, user: str) -> LLMAssessment:
        return await self.complete(system, user, LLMAssessment)

    async def complete(self, system: str, user: str, schema: type[T], *, effort: str | None = None) -> T:
        self.prompts.append((system, user))
        if not self.responses:
            if schema is LLMAssessment:
                return LLMAssessment(
                    decision="ESCALATED",
                    risk_level="MEDIUM",
                    confidence=0.0,
                    policy_refs=[],
                    rationale="FakeLLM has no scripted response",
                    employee_message="Đơn của bạn đã được chuyển cho người duyệt.",
                )
            raise LLMError(f"FakeLLM has no scripted {schema.__name__}")
        item = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(item, LLMError):
            raise item
        if isinstance(item, Exception):
            raise LLMError(str(item)) from item
        if callable(item):
            item = item(system, user)
        if not isinstance(item, schema):  # A test scripted the wrong kind of answer
            raise LLMError(f"FakeLLM scripted {type(item).__name__}, asked for {schema.__name__}")
        return item
