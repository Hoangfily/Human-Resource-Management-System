"""ATTENDANCE_EXPLANATION decision: gather the context from the API and build the LLM prompt.

Deadlines, duplicates, monthly count and time deviations are checked here in code and
returned as `limit_reasons`. "Payroll impact" is how far the recorded or requested time
is from the normal shift (or from the original record for WRONG_TIME), not the whole day:
a forgotten clock-out at 17:35 on a 17:30 shift is a 5-minute matter.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from pydantic import ValidationError

from ..config import Settings
from ..guardrails.pii import mask_for_llm, redact_text
from ..guardrails.untrusted import detect_injection, wrap_untrusted
from ..prompts import load_prompt
from ..schemas.common import RequestStatus, RequestType
from ..schemas.requests import (
    AttendanceEvent,
    AttendanceExplanationPayload,
    EmployeeContext,
    PolicySet,
    RequestDetail,
    ScheduleEntry,
    company_tz,
)
from ..tools.base import ApiClient
from ..tools.read_tools import get_attendance_events, get_employee, get_policies, get_schedules, list_requests
from .base import BuiltPrompt, day_label, policy_lines, to_json
from .shifts import ShiftWindow, shift_for_day

HISTORY_DAYS = 90
NOT_COUNTED = {RequestStatus.REJECTED, RequestStatus.CANCELLED, RequestStatus.DRAFT}


@dataclass(frozen=True)
class AttendanceContext:
    request: RequestDetail
    payload: AttendanceExplanationPayload
    employee: EmployeeContext
    schedule: ScheduleEntry | None
    events: list[AttendanceEvent] | None  # Clock events of that day; None = no trustworthy data
    history: list[RequestDetail]  # Other ATTENDANCE_EXPLANATION requests, last HISTORY_DAYS days
    policies: PolicySet
    today: date

    def shift(self) -> ShiftWindow | None:
        return shift_for_day(self.payload.date, self.schedule, self.employee)

    def registered_on(self) -> date:
        return (self.request.submitted_at or self.request.created_at).astimezone(company_tz()).date()

    def clock(self, kind: str) -> list[datetime]:
        return sorted(e.local() for e in self.events or [] if e.type == kind)


async def gather_attendance_context(api: ApiClient, request: RequestDetail, today: date) -> AttendanceContext:
    payload = request.attendance_payload()
    employee = await get_employee(api, request.employee_id)
    schedules = await get_schedules(api, request.employee_id, payload.date, payload.date)
    # One day either side: events are stored in UTC, the day boundary is in company time.
    events = await get_attendance_events(
        api, request.employee_id, payload.date - timedelta(days=1), payload.date + timedelta(days=1)
    )
    if events is not None:
        events = [e for e in events if e.local().date() == payload.date]
    history = [
        r
        for r in await list_requests(
            api, request.employee_id, type=RequestType.ATTENDANCE_EXPLANATION, since=today - timedelta(days=HISTORY_DAYS)
        )
        if r.id != request.id
    ]
    policies = await get_policies(api)
    schedule = next((s for s in schedules if s.date == payload.date), None)
    return AttendanceContext(request, payload, employee, schedule, events, history, policies, today)


def working_days_after(start: date, end: date) -> int:
    """Mon-Fri days in (start, end]."""
    return sum(1 for i in range(1, (end - start).days + 1) if (start + timedelta(days=i)).weekday() < 5)


def _minutes(delta: timedelta) -> int:
    return round(abs(delta.total_seconds()) / 60)


def impact_minutes(ctx: AttendanceContext) -> tuple[int | None, list[str]]:
    """How many minutes of working time the request changes, plus why it cannot be measured."""
    p, window = ctx.payload, ctx.shift()
    requested = p.requested()
    ins, outs = ctx.clock("CLOCK_IN"), ctx.clock("CLOCK_OUT")
    problems: list[str] = []

    if ctx.events is None:
        return None, ["Không đọc được dữ liệu chấm công gốc để đối chiếu"]
    if window is None:
        return None, ["Không có ca làm ngày này để đối chiếu"]

    if p.issue == "MISSING_CLOCK_IN":
        if ins:
            problems.append(f"Đơn báo thiếu giờ vào nhưng đã có giờ vào lúc {ins[0]:%H:%M}")
        if requested is None:
            problems.append("Đơn không ghi giờ vào cần ghi nhận")
        return (_minutes(requested - window.start) if requested else None), problems
    if p.issue == "MISSING_CLOCK_OUT":
        if outs:
            problems.append(f"Đơn báo thiếu giờ ra nhưng đã có giờ ra lúc {outs[-1]:%H:%M}")
        if requested is None:
            problems.append("Đơn không ghi giờ ra cần ghi nhận")
        return (_minutes(requested - window.end) if requested else None), problems
    if p.issue == "LATE":
        if not ins:
            return None, ["Không có giờ vào để đối chiếu với đơn đi muộn"]
        return max(0, round((ins[0] - window.start).total_seconds() / 60)), problems
    if p.issue == "EARLY_LEAVE":
        if not outs:
            return None, ["Không có giờ ra để đối chiếu với đơn về sớm"]
        return max(0, round((window.end - outs[-1]).total_seconds() / 60)), problems

    # WRONG_TIME: fix one recorded event
    original = next((e for e in ctx.events if e.id == p.attendance_event_id), None)
    if original is None:
        problems.append("Không tìm thấy bản ghi chấm công cần sửa")
    if requested is None:
        problems.append("Đơn không ghi giờ đúng cần ghi nhận")
    if original is None or requested is None:
        return None, problems
    return _minutes(requested - original.local()), problems


def check_limits(ctx: AttendanceContext, settings: Settings) -> list[str]:
    p = ctx.payload
    reasons: list[str] = []

    late_by = working_days_after(p.date, ctx.registered_on())
    if late_by > settings.att_explain_within_days:
        reasons.append(f"Giải trình sau {late_by} ngày làm việc, quá hạn {settings.att_explain_within_days} ngày")

    live = []
    for past in ctx.history:
        if past.status in NOT_COUNTED:
            continue
        try:
            live.append(past.attendance_payload())
        except ValidationError:
            continue
    if any(o.date == p.date and o.issue == p.issue for o in live):
        reasons.append("Đã có đơn giải trình khác cho cùng ngày và cùng lỗi")
    in_month = 1 + sum(1 for o in live if (o.date.year, o.date.month) == (p.date.year, p.date.month))
    if in_month > settings.att_max_auto_per_month:
        reasons.append(f"Đây là đơn giải trình thứ {in_month} trong tháng, vượt {settings.att_max_auto_per_month}")

    minutes, problems = impact_minutes(ctx)
    reasons.extend(problems)

    window, requested = ctx.shift(), p.requested()
    if window and requested:
        tolerance = timedelta(minutes=settings.att_shift_tolerance_minutes)
        if not window.start - tolerance <= requested <= window.end + tolerance:
            reasons.append(
                f"Giờ đề nghị {requested:%H:%M} nằm ngoài ca {window.start:%H:%M}–{window.end:%H:%M} "
                f"± {settings.att_shift_tolerance_minutes} phút"
            )

    if minutes is not None:
        if p.issue == "WRONG_TIME" and minutes > settings.att_major_deviation_minutes:
            reasons.append(f"Lệch {minutes} phút so với dữ liệu gốc, vượt {settings.att_major_deviation_minutes} phút")
        if minutes > settings.att_evidence_after_minutes and not ctx.request.attachments:
            reasons.append(
                f"Ảnh hưởng {minutes} phút mà không có bằng chứng (bắt buộc khi trên "
                f"{settings.att_evidence_after_minutes} phút)"
            )
        if minutes > settings.ai_max_auto_payroll_hours * 60:
            reasons.append(
                f"Ảnh hưởng {minutes / 60:g} giờ công, vượt giới hạn AI tự quyết ({settings.ai_max_auto_payroll_hours:g} giờ)"
            )
    return reasons


def build_attendance_prompt(ctx: AttendanceContext, settings: Settings) -> BuiltPrompt:
    prompt = load_prompt("attendance_decision")
    p = ctx.payload
    window = ctx.shift()
    requested = p.requested()
    minutes, _ = impact_minutes(ctx)
    limits = check_limits(ctx, settings)

    request_info = {
        "id": ctx.request.id,
        "date": day_label(p.date),
        "issue": p.issue,
        "requestedTime": f"{requested:%H:%M}" if requested else None,
        "impactMinutes": minutes,
        "workingDaysSinceDate": working_days_after(p.date, ctx.registered_on()),
        "attachmentCount": len(ctx.request.attachments),
        "createdBy": ctx.request.created_by_type.value,
    }
    events = (
        None
        if ctx.events is None
        else [{"id": e.id, "type": e.type, "time": f"{e.local():%H:%M}"} for e in sorted(ctx.events, key=lambda e: e.timestamp)]
    )
    employee = mask_for_llm(ctx.employee.model_dump(mode="json", by_alias=True, exclude={"id"}))
    history = []
    for past in ctx.history:  # Metadata only: past explanations are neither needed nor trusted
        try:
            o = past.attendance_payload()
        except ValidationError:
            continue
        history.append({"date": day_label(o.date), "issue": o.issue, "status": past.status.value})

    user = "\n\n".join(
        [
            f"## Today\n{day_label(ctx.today)}",
            f"## Request\n{to_json(request_info)}",
            f"## Explanation\n{wrap_untrusted(redact_text(p.explanation), 'explanation')}",
            f"## Employee\n{to_json(employee)}",
            f"## Shift on that day\n{to_json(window.to_prompt() if window else None)}",
            f"## Clock events on that day (null = not available)\n{to_json(events)}",
            f"## Limit findings (computed by code)\n{to_json(limits)}",
            f"## Explanation history (last {HISTORY_DAYS} days, this request excluded)\n{to_json(history)}",
            f"## Policies (version {ctx.policies.version}). Cite only these keys.\n{policy_lines(ctx.policies)}",
        ]
    )
    return BuiltPrompt(
        system=prompt.text,
        user=user,
        prompt_version=prompt.version,
        policies=ctx.policies,
        injection_flags=detect_injection(p.explanation),
        limit_reasons=limits,
    )
