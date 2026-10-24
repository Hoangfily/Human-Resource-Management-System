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
    when the code is known. The client's `daysCount` is never read here (see leave_agent.days_requested)."""

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


AttendanceIssue = Literal["MISSING_CLOCK_IN", "MISSING_CLOCK_OUT", "LATE", "EARLY_LEAVE", "WRONG_TIME"]

# The web app sends `explanationType` (its own codes) and `reason`; the spec says `issue` and `explanation`.
_WEB_ISSUES = {"FORGOT_CHECK_IN": "MISSING_CLOCK_IN", "FORGOT_CHECK_OUT": "MISSING_CLOCK_OUT"}


class AttendanceExplanationPayload(ApiModel):
    date: CompanyDate
    issue: AttendanceIssue
    attendance_event_id: str | None = None
    requested_time: str | None = None  # "HH:mm" (company time) or an ISO datetime
    explanation: str

    @model_validator(mode="before")
    @classmethod
    def _accept_web_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            data = dict(data)
            if "issue" not in data and "explanationType" in data:
                data["issue"] = _WEB_ISSUES.get(data["explanationType"], data["explanationType"])
            if "explanation" not in data and "reason" in data:
                data["explanation"] = data["reason"]
        return data

    @field_validator("requested_time")
    @classmethod
    def _time_or_datetime(cls, value: str | None) -> str | None:
        if value is not None and not _HH_MM.match(value):
            datetime.fromisoformat(value)  # Raises ValueError for anything else
        return value

    def requested(self) -> datetime | None:
        """The time the employee asks to record, in company time."""
        if self.requested_time is None:
            return None
        if _HH_MM.match(self.requested_time):
            return datetime.combine(self.date, time.fromisoformat(self.requested_time), company_tz())
        moment = datetime.fromisoformat(self.requested_time)
        return (moment if moment.tzinfo else moment.replace(tzinfo=company_tz())).astimezone(company_tz())


class ShiftChangePayload(ApiModel):
    """Spec: scheduleId + newDate + newShiftTemplateId. The web sends shiftDate + targetShiftId
    (change the shift of that day to another template), which is accepted too."""

    schedule_id: str | None = None
    shift_date: CompanyDate | None = None  # Day of the shift to change, when there is no scheduleId
    new_date: CompanyDate | None = None  # Defaults to the day of the current shift
    new_shift_template_id: str
    swap_with_employee_id: str | None = None
    reason: str

    @model_validator(mode="before")
    @classmethod
    def _accept_web_fields(cls, data: Any) -> Any:
        if isinstance(data, dict) and "newShiftTemplateId" not in data and "targetShiftId" in data:
            data = {**data, "newShiftTemplateId": data["targetShiftId"]}
        return data

    @model_validator(mode="after")
    def _needs_current_shift(self) -> "ShiftChangePayload":
        if not (self.schedule_id or self.shift_date):
            raise ValueError("scheduleId or shiftDate is required")
        return self


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

    def attendance_payload(self) -> AttendanceExplanationPayload:
        return AttendanceExplanationPayload.model_validate(self.payload)

    def shift_change_payload(self) -> ShiftChangePayload:
        return ShiftChangePayload.model_validate(self.payload)


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
    """One row of GET /shifts/schedules. Only the department id is kept from the embedded employee."""

    id: str
    employee_id: str | None = None
    department_id: str | None = None
    date: CompanyDate
    shift_start: datetime
    shift_end: datetime

    @model_validator(mode="before")
    @classmethod
    def _department_from_employee(cls, data: Any) -> Any:
        if isinstance(data, dict) and "departmentId" not in data:
            department = ((data.get("employee") or {}).get("department") or {}).get("id")
            data = {**data, "departmentId": department}
        return data

    def overlaps(self, start: datetime, end: datetime) -> bool:
        return self.shift_start < end and self.shift_end > start


class ShiftTemplate(ApiModel):
    """One row of GET /shifts/templates."""

    id: str
    name: str
    start_time: str  # "HH:mm"
    end_time: str  # "HH:mm"; earlier than start_time for a night shift


class AttendanceEvent(ApiModel):
    """One raw clock event (GET /attendance/events)."""

    id: str
    employee_id: str
    type: Literal["CLOCK_IN", "CLOCK_OUT"]
    timestamp: datetime

    def local(self) -> datetime:
        return self.timestamp.astimezone(company_tz())


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
