import asyncio
from collections.abc import Sequence

from google import genai
from google.genai import types
from pydantic import ValidationError

from ..schemas.decision import LLMAssessment
from .base import LLMError


class GeminiClient:
    """Gemini with structured output. Tries `model`, then each fallback model in order."""

    def __init__(
        self,
        api_key: str,
        model: str,
        *,
        fallback_models: Sequence[str] = (),
        timeout_s: float = 20,
        temperature: float = 0.1,
        client: genai.Client | None = None,
    ) -> None:
        if client is None and not api_key:
            raise LLMError("GEMINI_API_KEY is not set")
        self.model = model
        self.models = [model, *(m for m in fallback_models if m != model)]
        self.last_model = model
        self.timeout_s = timeout_s
        self.temperature = temperature
        # One internal retry per model; our own timeout caps each model's total time.
        self._client = client or genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=2)),
        )

    async def assess(self, system: str, user: str) -> LLMAssessment:
        errors: list[str] = []
        for model in self.models:
            try:
                result = await self._assess_once(model, system, user)
            except LLMError as exc:
                errors.append(f"{model}: {exc}")
                continue
            self.last_model = model
            return result
        raise LLMError("; ".join(errors))

    async def _assess_once(self, model: str, system: str, user: str) -> LLMAssessment:
        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=LLMAssessment,
            temperature=self.temperature,
        )
        try:
            response = await asyncio.wait_for(
                self._client.aio.models.generate_content(model=model, contents=user, config=config),
                timeout=self.timeout_s,
            )
        except TimeoutError as exc:
            raise LLMError(f"timed out after {self.timeout_s}s") from exc
        except Exception as exc:  # SDK/network errors of any kind
            raise LLMError(f"call failed: {type(exc).__name__}: {str(exc)[:200]}") from exc

        if isinstance(response.parsed, LLMAssessment):
            return response.parsed
        try:
            return LLMAssessment.model_validate_json(response.text or "")
        except ValidationError as exc:
            raise LLMError(f"invalid output: {(response.text or '')[:200]}") from exc
