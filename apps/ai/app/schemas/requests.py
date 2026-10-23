import re
from datetime import date, datetime, time
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo

from pydantic import BeforeValidator, field_validator, model_validator

from ..config import get_settings
from .common import ActorType, ApiModel, AutonomyLevel, RequestStatus, RequestType, RiskLevel


_HH_MM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def to_company_date(value: object) -> object:
    """Accept ISO datetimes for date fields; a UTC instant is read as a day in the company timezone."""
    if isinstance(value, str) and "T" in value:
        moment = datetime.fromisoformat(value)
        if moment.tzinfo:
            moment = moment.astimezone(company_tz())
        return moment.date()
    return value


def company_tz() -> ZoneInfo:
    return ZoneInfo(get_settings().company_timezone)


CompanyDate = Annotated[date, BeforeValidator(to_company_date)]


# ---- Payloads (docs/05-business-spec.md §3-§6) ----
class LeavePayload(ApiModel):
    """As stored by apps/api: the web sends `leaveType` (code) and the API adds `leaveTypeId`
    when the code is known. Client-sent `daysCount` is ignored: `computed.daysRequested` wins."""

    leave_type_id: str | None = None
    leave_type: str | None = None  # Code: ANNUAL, SICK, UNPAID, PERSONAL
    start_date: CompanyDate
    end_date: CompanyDate
    half_day: Literal["AM", "PM"] | None = None
    reason: str

    @model_validator(mode="after")
    def _needs_leave_type(self) -> "LeavePayload":
        if not (self.leave_type_id or self.leave_type):
            raise ValueError("leaveTypeId or leaveType is required")
        return self


class OvertimePayload(ApiModel):
    """OT is registered before it is worked, on one day, start and end in company time (HH:mm)."""

    date: CompanyDate
    start_time: str
    end_time: str
    reason: str

    @field_validator("start_time", "end_time")
    @classmethod
    def _hh_mm(cls, value: str) -> str:
        if not _HH_MM.match(value):
            raise ValueError("time must be HH:mm")
        return value

    @model_validator(mode="after")
    def _end_after_start(self) -> "OvertimePayload":
        if self.end_time <= self.start_time:
            raise ValueError("endTime must be after startTime (overnight OT is not supported)")
        return self

    def start(self) -> datetime:
        return datetime.combine(self.date, time.fromisoformat(self.start_time), company_tz())

    def end(self) -> datetime:
        return datetime.combine(self.date, time.fromisoformat(self.end_time), company_tz())

    def hours(self) -> float:
        return (self.end() - self.start()).total_seconds() / 3600


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

    def overtime_payload(self) -> OvertimePayload:
        return OvertimePayload.model_validate(self.payload)


class EmployeeContext(ApiModel):
    """Employee fields the AI may use. Contact details are deliberately absent."""

    id: str
    role: str
    status: str
    join_date: date | None = None
    department_id: str | None = None
    manager_id: str | None = None
    shift_time: str | None = None  # Default shift, e.g. "08:30 - 17:30"


class ScheduleEntry(ApiModel):
    """One row of GET /shifts/schedules (the embedded employee object is ignored)."""

    id: str
    date: CompanyDate
    shift_start: datetime
    shift_end: datetime


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
