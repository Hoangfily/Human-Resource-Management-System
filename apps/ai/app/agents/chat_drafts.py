"""Turn the request fields the LLM read from a chat into an action card the employee confirms.

Code, not the model, decides whether the draft is complete and valid, builds the API payload,
and runs the same hard-rule checks as decision mode (check_limits of each type agent). The web
then creates the request with the employee's own token: nothing is written here.
"""

import re
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time

from pydantic import ValidationError

from ..config import Settings
from ..schemas.chat import ActionCardData, ChatActionCard, ChatDraft, PolicyCheck
from ..schemas.common import RequestStatus, RequestType, RiskLevel
from ..schemas.requests import AttendanceExplanationPayload, LeavePayload, OvertimePayload, RequestDetail, company_tz
from ..tools.base import ApiClient
from . import attendance_agent, leave_agent, overtime_agent

LEAVE_NAMES = {"ANNUAL": "Nghỉ phép năm", "SICK": "Nghỉ ốm", "UNPAID": "Nghỉ không lương", "PERSONAL": "Nghỉ việc riêng có lương"}
ISSUE_NAMES = {
    "MISSING_CLOCK_IN": "Quên chấm công vào",
    "MISSING_CLOCK_OUT": "Quên chấm công ra",
    "LATE": "Đi muộn",
    "EARLY_LEAVE": "Về sớm",
}
FIELD_NAMES = {
    "leave_type": "loại nghỉ",
    "start_date": "ngày bắt đầu",
    "end_date": "ngày kết thúc",
    "date": "ngày",
    "start_time": "giờ bắt đầu",
    "end_time": "giờ kết thúc",
    "issue": "vấn đề chấm công",
    "requested_time": "giờ cần ghi nhận",
    "reason": "lý do",
}
REQUIRED = {
    "LEAVE": ["leave_type", "start_date", "end_date", "reason"],
    "OVERTIME": ["date", "start_time", "end_time", "reason"],
    "ATTENDANCE_EXPLANATION": ["date", "issue", "reason"],
}
_HH_MM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


@dataclass(frozen=True)
class DraftResult:
    card: ChatActionCard | None
    problem: str | None  # Question or explanation for the employee when there is no card


def missing_fields(draft: ChatDraft) -> list[str]:
    need = list(REQUIRED[draft.request_type])
    if draft.request_type == "ATTENDANCE_EXPLANATION" and draft.issue in ("MISSING_CLOCK_IN", "MISSING_CLOCK_OUT"):
        need.append("requested_time")
    return [f for f in need if not (getattr(draft, f) or "").strip()]


def api_payload(draft: ChatDraft) -> dict:
    """The `payload` of POST /requests, in the API's field names (same as the web form sends)."""
    reason = (draft.reason or "").strip()
    if draft.request_type == "LEAVE":
        payload = {"leaveType": draft.leave_type, "startDate": draft.start_date, "endDate": draft.end_date, "reason": reason}
        if draft.half_day:
            payload["halfDay"] = draft.half_day
        return payload
    if draft.request_type == "OVERTIME":
        return {"date": draft.date, "startTime": draft.start_time, "endTime": draft.end_time, "reason": reason}
    payload = {"date": draft.date, "issue": draft.issue, "explanation": reason}
    if draft.requested_time:
        payload["requestedTime"] = draft.requested_time
    return payload


def _fmt(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def _hours(start: str, end: str) -> float:
    (h1, m1), (h2, m2) = (map(int, start.split(":")), map(int, end.split(":")))
    return ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60


async def build_card(
    draft: ChatDraft, employee_id: str, api: ApiClient, settings: Settings, today: date
) -> DraftResult:
    missing = missing_fields(draft)
    if missing:
        names = ", ".join(FIELD_NAMES[f] for f in missing)
        return DraftResult(None, f"Để soạn đơn, bạn cho mình biết thêm: {names}.")
    for field in ("start_time", "end_time", "requested_time"):
        value = getattr(draft, field)
        if value and not _HH_MM.match(value):
            return DraftResult(None, f"Giờ “{value}” chưa đúng dạng, bạn ghi theo dạng 24 giờ, ví dụ 18:00.")

    payload = api_payload(draft)
    # "Registered" now, for notice and retro-OT checks; noon of `today` when the clock is on another day
    now = datetime.now(UTC)
    if now.astimezone(company_tz()).date() != today:
        now = datetime.combine(today, time(12), tzinfo=company_tz()).astimezone(UTC)
    request = RequestDetail(
        id="chat-draft",
        type=RequestType(draft.request_type),
        status=RequestStatus.DRAFT,
        employee_id=employee_id,
        payload=payload,
        created_at=now,
        updated_at=now,
    )
    try:  # Same parsing as decision mode: bad dates, end before start, end time before start time
        if draft.request_type == "LEAVE":
            parsed = request.leave_payload()
        elif draft.request_type == "OVERTIME":
            parsed = request.overtime_payload()
        else:
            parsed = request.attendance_payload()
    except ValidationError:
        return DraftResult(None, "Ngày hoặc giờ của đơn chưa hợp lệ (ví dụ ngày kết thúc trước ngày bắt đầu). Bạn kiểm tra lại giúp mình nhé.")

    if isinstance(parsed, LeavePayload):
        days = leave_agent.count_working_days(parsed.start_date, parsed.end_date, parsed.half_day)
        if days == 0:
            return DraftResult(None, "Khoảng ngày này chỉ gồm thứ 7 và chủ nhật, không cần xin nghỉ.")
        ctx = await leave_agent.gather_leave_context(api, request, today)
        findings = leave_agent.check_limits(ctx, settings)
        same_day = parsed.start_date == parsed.end_date
        half = {"AM": " (buổi sáng)", "PM": " (buổi chiều)"}.get(parsed.half_day or "", "")
        data = ActionCardData(
            type_name=LEAVE_NAMES[draft.leave_type or ""],
            leave_type=draft.leave_type,
            dates=_fmt(parsed.start_date) + half if same_day else f"{_fmt(parsed.start_date)} – {_fmt(parsed.end_date)}",
            duration_text=f"{days:g} ngày làm việc",
            days_count=days,
            reason=parsed.reason,
        )
        title = f"Đơn {LEAVE_NAMES[draft.leave_type or ''].lower()}"
    elif isinstance(parsed, OvertimePayload):
        ctx = await overtime_agent.gather_overtime_context(api, request, today)
        findings = overtime_agent.check_limits(ctx, settings)
        data = ActionCardData(
            type_name="Làm thêm giờ",
            dates=_fmt(parsed.date),
            duration_text=f"{_hours(parsed.start_time, parsed.end_time):g} giờ ({parsed.start_time}–{parsed.end_time})",
            reason=parsed.reason,
        )
        title = "Đơn làm thêm giờ"
    else:
        assert isinstance(parsed, AttendanceExplanationPayload)
        ctx = await attendance_agent.gather_attendance_context(api, request, today)
        findings = attendance_agent.check_limits(ctx, settings)
        at = f" lúc {parsed.requested_time}" if parsed.requested_time else ""
        data = ActionCardData(
            type_name="Giải trình chấm công",
            dates=_fmt(parsed.date),
            duration_text=ISSUE_NAMES[parsed.issue] + at,
            reason=parsed.explanation,
        )
        title = "Đơn giải trình chấm công"

    checks = [PolicyCheck(rule="HARD_RULE", passed=False, description=f) for f in findings] or [
        PolicyCheck(rule="HARD_RULES", passed=True, description="Đạt các luật cứng của công ty cho loại đơn này")
    ]
    card = ChatActionCard(
        id=str(uuid.uuid4()),
        title=title,
        request_type=RequestType(draft.request_type),
        data=data,
        payload=payload,
        policy_checks=checks,
        risk_level=RiskLevel.MEDIUM if findings else RiskLevel.LOW,
    )
    return DraftResult(card, None)
