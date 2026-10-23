from collections.abc import AsyncIterator
from datetime import datetime
from functools import lru_cache
from zoneinfo import ZoneInfo

from fastapi import Header

from .agents.supervisor import EvaluationDeps
from .config import get_settings
from .llm import LLMClient, get_llm
from .tools.base import ApiClient


@lru_cache
def _llm() -> LLMClient:
    return get_llm(get_settings())


async def get_evaluation_deps(
    x_correlation_id: str | None = Header(default=None),
) -> AsyncIterator[EvaluationDeps]:
    """One ApiClient per /evaluate call, reusing the caller's correlation id."""
    settings = get_settings()
    async with ApiClient(settings.api_base_url, settings.ai_service_token, correlation_id=x_correlation_id) as api:
        today = datetime.now(ZoneInfo(settings.company_timezone)).date()
        yield EvaluationDeps(api=api, llm=_llm(), settings=settings, today=today)
