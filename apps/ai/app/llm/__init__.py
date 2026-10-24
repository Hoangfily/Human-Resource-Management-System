from ..config import Settings
from ..schemas.decision import LLMAssessment
from .base import LLMClient, LLMError


def get_llm(settings: Settings) -> LLMClient:
    if settings.llm_provider == "fake":
        from .fake import FakeLLM

        return FakeLLM()
    if settings.llm_provider == "gemini":
        from .gemini_client import GeminiClient

        return GeminiClient(
            settings.gemini_api_key,
            settings.llm_model,
            fallback_models=settings.llm_fallback_models,
            timeout_s=settings.llm_timeout_s,
        )
    raise ValueError(f"Unknown LLM_PROVIDER: {settings.llm_provider}")


class UnavailableLLM:
    """Stand-in when the configured LLM cannot be built (missing key, unknown provider).

    Every assess() fails with LLMError, so each request is escalated with the cause in its
    trace instead of /evaluate answering 500 and leaving requests PENDING.
    """

    def __init__(self, cause: str) -> None:
        self.cause = cause
        self.model = self.last_model = "unavailable"

    async def assess(self, system: str, user: str) -> LLMAssessment:
        raise LLMError(f"LLM is not configured: {self.cause}")


def get_llm_or_unavailable(settings: Settings) -> LLMClient:
    try:
        return get_llm(settings)
    except (LLMError, ValueError) as exc:
        return UnavailableLLM(str(exc))


__all__ = ["LLMClient", "LLMError", "UnavailableLLM", "get_llm", "get_llm_or_unavailable"]
