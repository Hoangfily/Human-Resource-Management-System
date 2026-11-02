import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# apps/ai/.env holds local secrets (git-ignored); real env vars take precedence.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)


def _float(name: str, default: float) -> float:
    return float(os.getenv(name) or default)  # Empty counts as unset (docker-compose passes ${X:-} as "")


def _provider() -> str:
    """LLM_PROVIDER, else the provider of LLM_MODEL, else the one whose key is set (a Gemini-only .env
    keeps working), else openai."""
    if provider := os.getenv("LLM_PROVIDER", "").strip().lower():
        return provider
    if os.getenv("LLM_MODEL", "").strip().startswith("gemini"):
        return "gemini"
    return "gemini" if os.getenv("GEMINI_API_KEY") and not os.getenv("OPENAI_API_KEY") else "openai"


# Default (model, fallback models) per LLM_PROVIDER; LLM_MODEL / LLM_FALLBACK_MODELS override them.
DEFAULT_MODELS = {
    # Nano models (gpt-5-nano, gpt-5.4-nano) are cheaper but never confident enough to auto-decide
    # (eval: 0% automation), so a nano fallback would only add cost and delay before escalating.
    "openai": ("gpt-5.6-luna", "gpt-6-luna"),
    "gemini": ("gemini-3.8-flash", "gemini-3.5-flash"),
}


@dataclass(frozen=True)
class Settings:
    api_base_url: str
    ai_service_token: str  # AI -> API
    ai_inbound_token: str  # API -> AI (/evaluate)
    llm_provider: str  # "openai" | "gemini" | "fake"
    llm_model: str
    llm_fallback_models: tuple[str, ...]
    llm_timeout_s: float  # Per model attempt
    openai_api_key: str
    gemini_api_key: str
    ai_min_confidence: float
    ai_max_auto_leave_days: float
    leave_unpaid_max_auto_days: float  # LEAVE.UNPAID_MAX_AUTO_DAYS
    leave_sick_cert_after_days: float  # LEAVE.SICK_CERT_REQUIRED_AFTER_DAYS
    leave_sick_backdate_days: int  # LEAVE.SICK_BACKDATE_DAYS (working days)
    leave_notice_short_days: int  # LEAVE.NOTICE_DAYS for leave of up to leave_notice_long_after_days
    leave_notice_long_days: int  # LEAVE.NOTICE_DAYS for longer leave
    leave_notice_long_after_days: float
    ai_max_auto_payroll_hours: float  # AI.MAX_AUTO_PAYROLL_IMPACT_HOURS
    ot_max_total_hours_per_day: float  # OT.MAX_TOTAL_HOURS_PER_DAY (shift + OT)
    ot_max_hours_per_month: float  # OT.MAX_HOURS_PER_MONTH
    ot_max_hours_per_year: float  # OT.MAX_HOURS_PER_YEAR
    att_explain_within_days: int  # ATTENDANCE.EXPLAIN_WITHIN_DAYS (working days)
    att_shift_tolerance_minutes: int  # ATTENDANCE.SHIFT_TOLERANCE_MINUTES
    att_major_deviation_minutes: int  # ATTENDANCE.MAJOR_DEVIATION_MINUTES
    att_evidence_after_minutes: int  # ATTENDANCE.EVIDENCE_REQUIRED_AFTER_MINUTES
    att_max_auto_per_month: int  # ATTENDANCE.MAX_AUTO_PER_MONTH
    shift_notice_hours: float  # SHIFT.NOTICE_HOURS
    shift_min_rest_hours: float  # SHIFT.MIN_REST_HOURS
    shift_min_staff: int  # SHIFT.MIN_STAFF_PER_SHIFT (others left on the old shift)
    company_timezone: str


@lru_cache
def get_settings() -> Settings:
    provider = _provider()
    model, fallbacks = DEFAULT_MODELS.get(provider, ("", ""))
    return Settings(
        api_base_url=os.getenv("API_BASE_URL", "http://localhost:3000"),
        ai_service_token=os.getenv("AI_SERVICE_TOKEN", ""),
        ai_inbound_token=os.getenv("AI_INBOUND_TOKEN", ""),
        llm_provider=provider,
        llm_model=os.getenv("LLM_MODEL", "").strip() or model,
        llm_fallback_models=tuple(
            m.strip() for m in (os.getenv("LLM_FALLBACK_MODELS") or fallbacks).split(",") if m.strip()
        ),
        llm_timeout_s=_float("LLM_TIMEOUT_S", 20),
        openai_api_key=os.getenv("OPENAI_API_KEY", ""),
        gemini_api_key=os.getenv("GEMINI_API_KEY", ""),
        ai_min_confidence=_float("AI_MIN_CONFIDENCE", 0.85),
        ai_max_auto_leave_days=_float("AI_MAX_AUTO_LEAVE_DAYS", 3),
        leave_unpaid_max_auto_days=_float("LEAVE_UNPAID_MAX_AUTO_DAYS", 3),
        leave_sick_cert_after_days=_float("LEAVE_SICK_CERT_AFTER_DAYS", 2),
        leave_sick_backdate_days=int(_float("LEAVE_SICK_BACKDATE_DAYS", 2)),
        leave_notice_short_days=int(_float("LEAVE_NOTICE_SHORT_DAYS", 3)),
        leave_notice_long_days=int(_float("LEAVE_NOTICE_LONG_DAYS", 7)),
        leave_notice_long_after_days=_float("LEAVE_NOTICE_LONG_AFTER_DAYS", 2),
        ai_max_auto_payroll_hours=_float("AI_MAX_AUTO_PAYROLL_HOURS", 4),
        ot_max_total_hours_per_day=_float("OT_MAX_TOTAL_HOURS_PER_DAY", 12),
        ot_max_hours_per_month=_float("OT_MAX_HOURS_PER_MONTH", 40),
        ot_max_hours_per_year=_float("OT_MAX_HOURS_PER_YEAR", 200),
        att_explain_within_days=int(_float("ATT_EXPLAIN_WITHIN_DAYS", 3)),
        att_shift_tolerance_minutes=int(_float("ATT_SHIFT_TOLERANCE_MINUTES", 60)),
        att_major_deviation_minutes=int(_float("ATT_MAJOR_DEVIATION_MINUTES", 120)),
        att_evidence_after_minutes=int(_float("ATT_EVIDENCE_AFTER_MINUTES", 30)),
        att_max_auto_per_month=int(_float("ATT_MAX_AUTO_PER_MONTH", 3)),
        shift_notice_hours=_float("SHIFT_NOTICE_HOURS", 48),
        shift_min_rest_hours=_float("SHIFT_MIN_REST_HOURS", 12),
        shift_min_staff=int(_float("SHIFT_MIN_STAFF", 2)),
        company_timezone=os.getenv("COMPANY_TIMEZONE", "Asia/Ho_Chi_Minh"),
    )
