from ..config import Settings
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


__all__ = ["LLMClient", "LLMError", "get_llm"]
