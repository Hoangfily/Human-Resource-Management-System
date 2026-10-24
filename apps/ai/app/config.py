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
