import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# apps/ai/.env holds local secrets (git-ignored); real env vars take precedence.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)


def _float(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))


@dataclass(frozen=True)
class Settings:
    api_base_url: str
    ai_service_token: str  # AI -> API
    ai_inbound_token: str  # API -> AI (/evaluate)
    llm_provider: str  # "gemini" | "fake"
    llm_model: str
    llm_fallback_models: tuple[str, ...]
    llm_timeout_s: float  # Per model attempt
    gemini_api_key: str
    ai_min_confidence: float
    ai_max_auto_leave_days: float
    company_timezone: str


@lru_cache
def get_settings() -> Settings:
    return Settings(
        api_base_url=os.getenv("API_BASE_URL", "http://localhost:3000"),
        ai_service_token=os.getenv("AI_SERVICE_TOKEN", ""),
        ai_inbound_token=os.getenv("AI_INBOUND_TOKEN", ""),
        llm_provider=os.getenv("LLM_PROVIDER", "gemini"),
        llm_model=os.getenv("LLM_MODEL", "gemini-3.8-flash"),
        llm_fallback_models=tuple(
            m.strip() for m in os.getenv("LLM_FALLBACK_MODELS", "gemini-3.5-flash").split(",") if m.strip()
        ),
        llm_timeout_s=_float("LLM_TIMEOUT_S", 20),
        gemini_api_key=os.getenv("GEMINI_API_KEY", ""),
        ai_min_confidence=_float("AI_MIN_CONFIDENCE", 0.85),
        ai_max_auto_leave_days=_float("AI_MAX_AUTO_LEAVE_DAYS", 3),
        company_timezone=os.getenv("COMPANY_TIMEZONE", "Asia/Ho_Chi_Minh"),
    )
