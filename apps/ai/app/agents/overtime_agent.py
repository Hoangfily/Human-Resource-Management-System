"""OVERTIME decision: gather the context from the API and build the LLM prompt.

Hour limits (per request, per day, per month, per year) are checked here in code and
returned as `limit_reasons`: the LLM is told about them but never decides them.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from pydantic import ValidationError

from ..config import Settings
from ..guardrails.pii import mask_for_llm, redact_text
from ..guardrails.untrusted import detect_injection, wrap_untrusted
from ..prompts import load_prompt
from ..schemas.common import RequestStatus, RequestType
from ..schemas.requests import (
    EmployeeContext,
    OvertimePayload,
    PolicySet,
    RequestDetail,
    ScheduleEntry,
)
from ..tools.base import ApiClient
from ..tools.read_tools import get_employee, get_policies, get_schedules, list_requests
from .base import BuiltPrompt, day_label, policy_lines, to_json
from .shifts import ShiftWindow, shift_for_day

HISTORY_DAYS = 90
ADVANCE_DAYS = 92  # How far ahead OT may be registered (counted in the year/month of the OT date)
# OT that already counts against the monthly/yearly limits
COUNTED = {RequestStatus.PENDING, RequestStatus.ESCALATED, RequestStatus.APPROVED}


@dataclass(frozen=True)
class OvertimeContext:
    request: RequestDetail
    payload: OvertimePayload
    employee: EmployeeContext
    schedule: ScheduleEntry | None  # Assigned shift on the OT day, if any
    history: list[RequestDetail]  # Other OVERTIME requests since Jan 1 (or the last 90 days)
    policies: PolicySet
    today: date


async def gather_overtime_context(api: ApiClient, request: RequestDetail, today: date) -> OvertimeContext:
    payload = request.overtime_payload()
    employee = await get_employee(api, request.employee_id)
    schedules = await get_schedules(api, request.employee_id, payload.date, payload.date)
    # Rows are fetched by creation date but counted by OT date: start early enough to catch OT
    # registered in advance (e.g. created in December for January days).
    since = min(date(payload.date.year, 1, 1) - timedelta(days=ADVANCE_DAYS), today - timedelta(days=HISTORY_DAYS))
    history = (await list_requests(api, request.employee_id, type=RequestType.OVERTIME, since=since)).without(request.id)
    policies = await get_policies(api)
    schedule = next((s for s in schedules if s.date == payload.date), None)
    return OvertimeContext(request, payload, employee, schedule, history, policies, today)


def shift_window(ctx: OvertimeContext) -> ShiftWindow | None:
    return shift_for_day(ctx.payload.date, ctx.schedule, ctx.employee)


def counted_hours(ctx: OvertimeContext) -> tuple[float, float]:
    """OT hours already registered in the same month and year (this request excluded)."""
    month = year = 0.0
    for past in ctx.history:
        if past.status not in COUNTED:
            continue
        try:
            p = past.overtime_payload()
        except ValidationError:
            continue  # A malformed old request must not block today's decision
        if p.date.year == ctx.payload.date.year:
            year += p.hours()
            if p.date.month == ctx.payload.date.month:
                month += p.hours()
    return month, year


def same_day_overtime(ctx: OvertimeContext) -> list[OvertimePayload]:
    """Other OT on the same date that already counts (pending, escalated or approved)."""
    found = []
    for past in ctx.history:
        if past.status not in COUNTED:
            continue
        try:
            p = past.overtime_payload()
        except ValidationError:
            continue
        if p.date == ctx.payload.date:
            found.append(p)
    return found


def unreadable_history(ctx: OvertimeContext) -> int:
    """Old OT requests that count toward the limits but cannot be read: totals may be too low."""
    count = getattr(ctx.history, "skipped", 0)  # Rows the API returned that did not even parse
    for past in ctx.history:
        if past.status not in COUNTED:
            continue
        try:
            past.overtime_payload()
        except ValidationError:
            count += 1
    return count


def check_limits(ctx: OvertimeContext, settings: Settings) -> list[str]:
    payload = ctx.payload
    hours = payload.hours()
    reasons = []

    if hours > settings.ai_max_auto_payroll_hours:
        reasons.append(f"Đơn OT {hours:g} giờ vượt giới hạn AI tự quyết ({settings.ai_max_auto_payroll_hours:g} giờ)")

    registered = ctx.request.submitted_at or ctx.request.created_at
    if registered >= payload.start():
        reasons.append("Đăng ký sau giờ bắt đầu làm thêm (OT hồi tố)")

    same_day = same_day_overtime(ctx)
    for other in same_day:
        if payload.start() < other.end() and payload.end() > other.start():
            reasons.append(f"Trùng giờ với đơn OT khác cùng ngày ({other.start_time}–{other.end_time})")
    window = shift_window(ctx)
    if window and payload.start() < window.end and payload.end() > window.start:
        reasons.append(f"Giờ OT trùng với ca làm ({window.start:%H:%M}–{window.end:%H:%M})")
    total = (window.hours() if window else 0) + sum(o.hours() for o in same_day) + hours
    if total > settings.ot_max_total_hours_per_day:
        reasons.append(f"Tổng giờ làm trong ngày {total:g} giờ vượt {settings.ot_max_total_hours_per_day:g} giờ")

    unreadable = unreadable_history(ctx)
    if unreadable:
        reasons.append(f"Có {unreadable} đơn OT cũ không đọc được, tổng giờ tháng/năm có thể bị thiếu")

    month, year = counted_hours(ctx)
    if month + hours > settings.ot_max_hours_per_month:
        reasons.append(
            f"Tổng OT tháng {payload.date.month}/{payload.date.year} sẽ là {month + hours:g} giờ, "
            f"vượt {settings.ot_max_hours_per_month:g} giờ"
        )
    if year + hours > settings.ot_max_hours_per_year:
        reasons.append(
            f"Tổng OT năm {payload.date.year} sẽ là {year + hours:g} giờ, vượt {settings.ot_max_hours_per_year:g} giờ"
        )
    return reasons


def build_overtime_prompt(ctx: OvertimeContext, settings: Settings) -> BuiltPrompt:
    prompt = load_prompt("overtime_decision")
    payload = ctx.payload
    hours = payload.hours()
    window = shift_window(ctx)
    month, year = counted_hours(ctx)
    limits = check_limits(ctx, settings)
    registered = ctx.request.submitted_at or ctx.request.created_at

    request_info = {
        "id": ctx.request.id,
        "date": day_label(payload.date),
        "startTime": payload.start_time,
        "endTime": payload.end_time,
        "hours": round(hours, 2),
        "calendarDaysUntilDate": (payload.date - ctx.today).days,
        "registeredBeforeStart": registered < payload.start(),
        "attachmentCount": len(ctx.request.attachments),
        "createdBy": ctx.request.created_by_type.value,
    }
    shift = window.to_prompt() if window else None
    totals = {
        "monthHoursBefore": round(month, 2),
        "monthHoursAfter": round(month + hours, 2),
        "monthLimit": settings.ot_max_hours_per_month,
        "yearHoursBefore": round(year, 2),
        "yearHoursAfter": round(year + hours, 2),
        "yearLimit": settings.ot_max_hours_per_year,
    }
    employee = mask_for_llm(ctx.employee.model_dump(mode="json", by_alias=True, exclude={"id"}))
    recent_from = ctx.today - timedelta(days=HISTORY_DAYS)
    history = []
    for past in ctx.history:  # Metadata only: past reasons are neither needed nor trusted
        try:
            p = past.overtime_payload()
        except ValidationError:
            continue
        if p.date >= recent_from:
            history.append(
                {
                    "date": day_label(p.date),
                    "startTime": p.start_time,
                    "endTime": p.end_time,
                    "hours": round(p.hours(), 2),
                    "status": past.status.value,
                }
            )

    user = "\n\n".join(
        [
            f"## Today\n{day_label(ctx.today)}",
            f"## Request\n{to_json(request_info)}",
            f"## Reason\n{wrap_untrusted(redact_text(payload.reason), 'reason')}",
            f"## Employee\n{to_json(employee)}",
            f"## Shift on that day\n{to_json(shift)}",
            f"## Overtime totals (pending, escalated and approved requests)\n{to_json(totals)}",
            f"## Limit findings (computed by code)\n{to_json(limits)}",
            f"## Overtime history (last {HISTORY_DAYS} days, this request excluded)\n{to_json(history)}",
            f"## Policies (version {ctx.policies.version}). Cite only these keys.\n{policy_lines(ctx.policies)}",
        ]
    )
    return BuiltPrompt(
        system=prompt.text,
        user=user,
        prompt_version=prompt.version,
        policies=ctx.policies,
        injection_flags=detect_injection(payload.reason),
        limit_reasons=limits,
    )
