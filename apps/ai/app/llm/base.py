from typing import Protocol

from ..schemas.decision import LLMAssessment


class LLMError(Exception):
    """Any LLM failure (timeout, quota, bad output). Callers must escalate, never guess."""


class LLMClient(Protocol):
    model: str  # Primary model
    last_model: str  # Model that produced the last answer (for the trace)

    async def assess(self, system: str, user: str) -> LLMAssessment: ...
