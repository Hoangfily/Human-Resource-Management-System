from collections.abc import Callable
from dataclasses import dataclass, field

from ..schemas.decision import LLMAssessment
from .base import LLMError

Scripted = LLMAssessment | Exception | Callable[[str, str], LLMAssessment]


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
        self.prompts.append((system, user))
        if not self.responses:
            return LLMAssessment(
                decision="ESCALATED",
                risk_level="MEDIUM",
                confidence=0.0,
                policy_refs=[],
                rationale="FakeLLM has no scripted response",
                employee_message="Đơn của bạn đã được chuyển cho người duyệt.",
            )
        item = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(item, LLMError):
            raise item
        if isinstance(item, Exception):
            raise LLMError(str(item)) from item
        if callable(item):
            return item(system, user)
        return item
