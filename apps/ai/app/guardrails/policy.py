"""Last check before the AI acts on its own (docs/05-business-spec.md §7.3–7.4).

The API repeats these checks; doing them here too means the AI never even proposes a
decision it is not allowed to make. Reasons are in Vietnamese: human reviewers read them.
"""

from collections.abc import Collection
from dataclasses import dataclass, field

from ..schemas.common import AutonomyLevel, FinalAction, RiskLevel
from ..schemas.decision import LLMAssessment
from ..schemas.requests import AutonomyConfig

_ALLOWED: dict[AutonomyLevel, set[str]] = {
    AutonomyLevel.SUGGEST_ONLY: set(),
    AutonomyLevel.AUTO_APPROVE_LOW_RISK: {"APPROVED"},
    AutonomyLevel.AUTO_DECIDE_LOW_RISK: {"APPROVED", "REJECTED"},
}


@dataclass(frozen=True)
class GuardResult:
    action: FinalAction
    reasons: list[str] = field(default_factory=list)  # Why the AI may not act alone


def apply_autonomy(
    assessment: LLMAssessment,
    autonomy: AutonomyConfig,
    *,
    known_policy_keys: Collection[str],
    global_min_confidence: float,
    injection_flags: Collection[str] = (),
    days_requested: float | None = None,
    max_auto_days: float | None = None,
    limit_reasons: Collection[str] = (),
) -> GuardResult:
    """`limit_reasons`: type-specific limits the agent found broken (e.g. OT hours); each escalates."""
    reasons: list[str] = []

    if assessment.decision == "ESCALATED":
        reasons.append("AI đề xuất chuyển cho người duyệt")
    elif assessment.decision not in _ALLOWED[autonomy.level]:
        verb = "duyệt" if assessment.decision == "APPROVED" else "từ chối"
        reasons.append(f"Mức tự chủ {autonomy.level} không cho AI tự {verb}")

    if assessment.risk_level != RiskLevel.LOW:
        reasons.append(f"Mức rủi ro {assessment.risk_level}")

    min_confidence = max(autonomy.min_confidence, global_min_confidence)
    if assessment.confidence < min_confidence:
        reasons.append(f"Độ tin cậy {assessment.confidence:.2f} thấp hơn ngưỡng {min_confidence:.2f}")

    if not assessment.policy_refs:
        reasons.append("AI không trích dẫn điều khoản chính sách nào")
    unknown = sorted(set(assessment.policy_refs) - set(known_policy_keys))
    if unknown:
        reasons.append(f"Trích dẫn điều khoản không tồn tại: {', '.join(unknown)}")

    if injection_flags:
        reasons.append(f"Nội dung đơn có dấu hiệu thao túng AI ({', '.join(injection_flags)})")

    if days_requested is not None and max_auto_days is not None and days_requested > max_auto_days:
        reasons.append(f"Đơn {days_requested:g} ngày vượt giới hạn AI tự quyết ({max_auto_days:g} ngày)")

    reasons.extend(limit_reasons)

    if reasons:
        return GuardResult(FinalAction.ESCALATE, reasons)
    action = FinalAction.APPROVE if assessment.decision == "APPROVED" else FinalAction.REJECT
    return GuardResult(action)


def escalation_risk(assessment: LLMAssessment | None, injection_flags: Collection[str] = ()) -> RiskLevel:
    """Risk level to report when escalating. Injection attempts are always HIGH."""
    if injection_flags:
        return RiskLevel.HIGH
    if assessment is None:
        return RiskLevel.MEDIUM  # Technical failure: we know nothing about the request
    return RiskLevel(assessment.risk_level)
