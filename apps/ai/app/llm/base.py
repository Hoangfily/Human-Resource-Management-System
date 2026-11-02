import asyncio
import logging
from collections.abc import Sequence
from typing import Any, Protocol

from pydantic import ValidationError

from ..schemas.decision import LLMAssessment

logger = logging.getLogger(__name__)


class LLMError(Exception):
    """Any LLM failure (timeout, quota, bad output). Callers must escalate, never guess."""


class LLMClient(Protocol):
    model: str  # Primary model
    last_model: str  # Model that produced the last answer (for the trace)

    async def assess(self, system: str, user: str) -> LLMAssessment: ...


class FallbackLLM:
    """Tries `model`, then each fallback model in order, each capped by `timeout_s`.

    Subclasses only make the SDK call (`_call`); errors, timeouts and output parsing are handled here.
    """

    def __init__(self, model: str, fallback_models: Sequence[str] = (), *, timeout_s: float = 20) -> None:
        self.model = model
        self.models = [model, *(m for m in fallback_models if m != model)]
        self.last_model = model
        self.timeout_s = timeout_s

    async def assess(self, system: str, user: str) -> LLMAssessment:
        errors: list[str] = []
        for model in self.models:
            try:
                result = await self._assess_once(model, system, user)
            except LLMError as exc:
                errors.append(f"{model}: {exc}")
                continue
            if errors:  # Otherwise a failing primary model goes unnoticed while the fallback answers
                logger.warning("LLM fell back to %s after: %s", model, "; ".join(errors))
            self.last_model = model
            return result
        self.last_model = "/".join(self.models)  # Every model was tried; not the last one that worked
        raise LLMError("; ".join(errors))

    async def _assess_once(self, model: str, system: str, user: str) -> LLMAssessment:
        try:
            parsed, text = await asyncio.wait_for(self._call(model, system, user), timeout=self.timeout_s)
        except TimeoutError as exc:
            raise LLMError(f"timed out after {self.timeout_s}s") from exc
        except ValidationError as exc:  # The SDK parsed the reply itself; its message quotes the model text
            raise LLMError(f"invalid output: {exc.error_count()} schema error(s)") from exc
        except Exception as exc:  # SDK/network errors of any kind
            raise LLMError(f"call failed: {type(exc).__name__}: {str(exc)[:200]}") from exc

        if isinstance(parsed, LLMAssessment):
            return parsed
        try:  # e.g. a refusal or plain text instead of the schema
            return LLMAssessment.model_validate_json(text or "")
        except ValidationError as exc:
            raise LLMError(f"invalid output: {(text or '')[:200]}") from exc

    async def _call(self, model: str, system: str, user: str) -> tuple[Any, str | None]:
        """One SDK call: (parsed output or None, raw text)."""
        raise NotImplementedError
