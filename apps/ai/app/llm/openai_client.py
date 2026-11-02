import re
from collections.abc import Sequence
from typing import Any

from openai import AsyncOpenAI, BadRequestError

from ..schemas.decision import LLMAssessment
from .base import FallbackLLM, LLMError

# Reasoning models reject `temperature`; they take a reasoning effort instead.
REASONING_PREFIXES = ("gpt-5", "gpt-6", "o1", "o3", "o4")
TUNING_PARAMS = {"temperature", "reasoning", "reasoning.effort"}


def tuning_options(model: str, temperature: float) -> dict[str, Any]:
    """The least reasoning each model accepts (fewest tokens), or a temperature for the others.

    A guess from the name: when the API rejects it, `_call` retries with a safer setting.
    """
    name = model.removeprefix("ft:")  # Fine-tuned models keep their base model's rules
    if not name.startswith(REASONING_PREFIXES) or "-chat" in name:
        return {"temperature": temperature}
    if "-pro" in name:
        effort = "high"  # The only effort pro models accept
    elif re.match(r"gpt-5(-|$)", name):
        effort = "minimal"  # gpt-5, gpt-5-mini, gpt-5-nano
    elif name.startswith(("o1", "o3", "o4")):
        effort = "low"
    else:
        effort = "none"  # gpt-5.1 and later
    return {"reasoning": {"effort": effort}}


def _safer(options: dict[str, Any]) -> dict[str, Any]:
    """After a rejected tuning param: "low" effort is accepted by nearly every reasoning model and stays
    cheap (the model's own default is "medium"); with no reasoning param left, send nothing."""
    if options.get("reasoning", {}).get("effort") not in (None, "low"):
        return {"reasoning": {"effort": "low"}}
    return {}


def _refusal(response: Any) -> str | None:
    for item in getattr(response, "output", None) or []:
        for part in getattr(item, "content", None) or []:
            if getattr(part, "type", None) == "refusal":
                return f"refused: {getattr(part, 'refusal', '')}"
    return None


class OpenAIClient(FallbackLLM):
    """OpenAI Responses API with structured output. Tries `model`, then each fallback model in order."""

    def __init__(
        self,
        api_key: str,
        model: str,
        *,
        fallback_models: Sequence[str] = (),
        timeout_s: float = 20,
        temperature: float = 0.1,
        client: AsyncOpenAI | None = None,
    ) -> None:
        if client is None and not api_key:
            raise LLMError("OPENAI_API_KEY is not set")
        super().__init__(model, fallback_models, timeout_s=timeout_s)
        self.temperature = temperature
        self._accepted: dict[str, dict[str, Any]] = {}  # Tuning options each model accepted
        # One internal retry per model; our own timeout caps each model's total time.
        self._client = client or AsyncOpenAI(api_key=api_key, max_retries=1)

    async def _call(self, model: str, system: str, user: str) -> tuple[Any, str | None]:
        # store=False: OpenAI must not keep HR prompts (employee data) after answering.
        request = {"model": model, "instructions": system, "input": user, "text_format": LLMAssessment, "store": False}
        options = self._accepted[model] if model in self._accepted else tuning_options(model, self.temperature)
        while True:
            try:
                response = await self._client.responses.parse(**request, **options)
                break
            except BadRequestError as exc:
                if not options or getattr(exc, "param", None) not in TUNING_PARAMS:
                    raise
                options = _safer(options)
        self._accepted[model] = options  # Later requests skip the rejected call
        return response.output_parsed, _refusal(response) or getattr(response, "output_text", None)
