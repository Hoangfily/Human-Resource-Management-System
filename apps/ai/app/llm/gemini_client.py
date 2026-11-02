from collections.abc import Sequence
from typing import Any

from google import genai
from google.genai import types
from pydantic import BaseModel

from .base import FallbackLLM, LLMError


class GeminiClient(FallbackLLM):
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
        super().__init__(model, fallback_models, timeout_s=timeout_s)
        self.temperature = temperature
        # One internal retry per model; our own timeout caps each model's total time.
        self._client = client or genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=2)),
        )

    async def _call(self, model: str, system: str, user: str, schema: type[BaseModel]) -> tuple[Any, str | None]:
        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
            temperature=self.temperature,
        )
        response = await self._client.aio.models.generate_content(model=model, contents=user, config=config)
        return response.parsed, getattr(response, "text", None)
