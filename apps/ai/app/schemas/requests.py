from datetime import date, datetime
from typing import Any, Literal

from .common import ActorType, ApiModel, AutonomyLevel, RequestStatus, RequestType, RiskLevel


# ---- Payloads (docs/05-business-spec.md §3-§6) ----
class LeavePayload(ApiModel):
    leave_type_id: str
    start_date: date
    end_date: date
    half_day: Literal["AM", "PM"] | None = None
    reason: str


class OvertimePayload(ApiModel):
    date: date
    start_time: str
    end_time: str
    reason: str


class AttendanceExplanationPayload(ApiModel):
    date: date
    issue: Literal["MISSING_CLOCK_IN", "MISSING_CLOCK_OUT", "LATE", "EARLY_LEAVE", "WRONG_TIME"]
    attendance_event_id: str | None = None
    requested_time: datetime | None = None
    explanation: str


class ShiftChangePayload(ApiModel):
    schedule_id: str
    new_date: date
    new_shift_template_id: str
    swap_with_employee_id: str | None = None
    reason: str


# ---- Read models ----
class ApprovalSummary(ApiModel):
    decider_type: ActorType
    approver_id: str | None = None
    status: str
    reason: str | None = None
    risk_level: RiskLevel | None = None
    confidence: float | None = None
    decided_at: datetime | None = None


class RequestDetail(ApiModel):
    id: str
    type: RequestType
    status: RequestStatus
    employee_id: str
    created_by_id: str | None = None
    created_by_type: ActorType = ActorType.HUMAN
    payload: dict[str, Any]
    computed: dict[str, Any] = {}
    attachments: list[str] = []
    risk_level: RiskLevel | None = None
    approvals: list[ApprovalSummary] = []
    submitted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    def leave_payload(self) -> LeavePayload:
        return LeavePayload.model_validate(self.payload)


class EmployeeContext(ApiModel):
    """Employee fields the AI may use. Contact details are deliberately absent."""

    id: str
    role: str
    status: str
    join_date: date | None = None
    department_id: str | None = None
    manager_id: str | None = None


class LeaveBalance(ApiModel):
    leave_type_id: str
    leave_type_code: str
    year: int
    total_days: float
    used_days: float
    pending_days: float = 0
    available_days: float


class Policy(ApiModel):
    key: str
    version: str
    title: str
    content: str


class PolicySet(ApiModel):
    version: str
    items: list[Policy]

    def keys(self) -> set[str]:
        return {p.key for p in self.items}


class AutonomyConfig(ApiModel):
    request_type: RequestType
    level: AutonomyLevel = AutonomyLevel.SUGGEST_ONLY
    min_confidence: float = 0.85
