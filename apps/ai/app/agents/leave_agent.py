"""LEAVE decision: gather the context from the API and build the LLM prompt.

The hard rules of docs/05-business-spec.md §3.4 (balance, notice, overlap, dates, probation,
unpaid/sick limits) are checked here in code and returned as `limit_reasons`: apps/api does
not enforce them yet, and the LLM is never trusted with them.

Only what the decision needs reaches the LLM: no contact details, no reasons from
past requests, attachment count instead of URLs.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from pydantic import ValidationError

from ..config import Settings
from ..guardrails.pii import mask_for_llm, redact_text
from ..guardrails.untrusted import detect_injection, wrap_untrusted
from ..prompts import load_prompt
from ..schemas.common import RequestStatus, RequestType
from ..schemas.requests import EmployeeContext, LeaveBalance, LeavePayload, PolicySet, RequestDetail, company_tz
from ..tools.base import ApiClient
from ..tools.read_tools import RequestHistory, get_employee, get_leave_balance, get_policies, list_requests
from .base import BuiltPrompt, day_label, policy_lines, to_json

HISTORY_DAYS = 90  # Shown to the LLM
OVERLAP_LOOKBACK_DAYS = 365  # Fetched for the overlap check (leave can be booked far ahead)
KNOWN_LEAVE_TYPES = {"ANNUAL", "SICK", "UNPAID", "PERSONAL"}
FUNDED_LEAVE_TYPES = {"ANNUAL", "PERSONAL"}  # §3.4: types with a balance to respect
LIVE = {RequestStatus.PENDING, RequestStatus.ESCALATED, RequestStatus.APPROVED}


@dataclass(frozen=True)
class LeaveContext:
    request: RequestDetail
    payload: LeavePayload
    employee: EmployeeContext
    balances: list[LeaveBalance]
    history: RequestHistory  # Other LEAVE requests of the employee, last OVERLAP_LOOKBACK_DAYS days
    policies: PolicySet
    today: date

    def _balance_for(self, payload: LeavePayload) -> LeaveBalance | None:
        """Match by leaveTypeId, else by code; prefer the balance of the leave's own year."""
        matches = [b for b in self.balances if payload.leave_type_id and b.leave_type_id == payload.leave_type_id]
        matches = matches or [b for b in self.balances if b.leave_type_code == payload.leave_type]
        return next((b for b in matches if b.year == payload.start_date.year), None) or (matches[0] if matches else None)

    def leave_type_code(self, payload: LeavePayload) -> str:
        balance = self._balance_for(payload)
        if balance:
            return balance.leave_type_code
        return payload.leave_type if payload.leave_type in KNOWN_LEAVE_TYPES else "UNKNOWN"

    def balance(self) -> LeaveBalance | None:
        return self._balance_for(self.payload)

    def registered_on(self) -> date:
        return (self.request.submitted_at or self.request.created_at).astimezone(company_tz()).date()


async def gather_leave_context(api: ApiClient, request: RequestDetail, today: date) -> LeaveContext:
    employee = await get_employee(api, request.employee_id)
    balances = await get_leave_balance(api, request.employee_id)
    since = today - timedelta(days=OVERLAP_LOOKBACK_DAYS)
    history = (await list_requests(api, request.employee_id, type=RequestType.LEAVE, since=since)).without(request.id)
    policies = await get_policies(api)
    return LeaveContext(request, request.leave_payload(), employee, balances, history, policies, today)


def count_working_days(start: date, end: date, half_day: str | None = None) -> float:
    """Mon-Fri days in [start, end] (half_day is only valid for one day). The API also skips holidays."""
    days = sum(1 for i in range((end - start).days + 1) if (start + timedelta(days=i)).weekday() < 5)
    return min(0.5, float(days)) if half_day else float(days)


def working_days_between(after: date, before: date) -> int:
    """Mon-Fri days strictly after `after` and strictly before `before`."""
    return sum(1 for i in range(1, (before - after).days) if (after + timedelta(days=i)).weekday() < 5)


def reserved_days(ctx: LeaveContext) -> float:
    """What apps/api put in pendingDays for this request (it copies the client's daysCount)."""
    try:
        return float(ctx.request.computed.get("daysRequested") or 0)
    except (TypeError, ValueError):
        return 0.0


def days_requested(ctx: LeaveContext) -> float:
    """The larger of the API's count and our own weekday count: a 10-day leave sent with
    daysCount=1 must still count as 10."""
    own = count_working_days(ctx.payload.start_date, ctx.payload.end_date, ctx.payload.half_day)
    return max(own, reserved_days(ctx))


def _live_payloads(ctx: LeaveContext) -> tuple[list[LeavePayload], int]:
    """Other leave that still holds (pending, escalated, approved), and how many could not be read."""
    found, unreadable = [], ctx.history.skipped
    for past in ctx.history:
        if past.status not in LIVE:
            continue
        try:
            found.append(past.leave_payload())
        except ValidationError:
            unreadable += 1
    return found, unreadable


def check_limits(ctx: LeaveContext, settings: Settings) -> list[str]:
    p = ctx.payload
    reasons: list[str] = []
    days = days_requested(ctx)
    code = ctx.leave_type_code(p)
    registered = ctx.registered_on()

    if code == "UNKNOWN":
        reasons.append("Không xác định được loại nghỉ")

    if p.start_date < registered:
        late = working_days_between(p.start_date, registered) + (1 if registered.weekday() < 5 else 0)
        if code != "SICK" or late > settings.leave_sick_backdate_days:
            reasons.append(f"Ngày nghỉ {p.start_date:%d/%m} đã qua")
    elif code != "SICK":
        needed = settings.leave_notice_short_days if days <= settings.leave_notice_long_after_days else settings.leave_notice_long_days
        notice = working_days_between(registered, p.start_date)
        if notice < needed:
            reasons.append(f"Báo trước {notice} ngày làm việc, cần {needed} ngày")

    others, unreadable = _live_payloads(ctx)
    for o in others:
        if o.start_date <= p.end_date and p.start_date <= o.end_date:
            reasons.append(f"Trùng ngày với đơn nghỉ khác ({o.start_date:%d/%m}–{o.end_date:%d/%m})")
    if unreadable:
        reasons.append(f"Có {unreadable} đơn nghỉ cũ không đọc được, không kiểm tra được trùng ngày")

    if code == "ANNUAL" and ctx.employee.status == "PROBATION":
        reasons.append("Nhân viên đang thử việc xin nghỉ phép năm")

    if code in FUNDED_LEAVE_TYPES:
        balance = ctx.balance()
        if balance is None or balance.year != p.start_date.year:
            reasons.append(f"Không có quỹ phép {code} năm {p.start_date.year} để đối chiếu")
        else:
            # apps/api already reserved this request in pendingDays (using the client's count) and
            # clamps availableDays at 0: use the raw fields and add what it under-reserved.
            remaining = balance.total_days - balance.used_days - balance.pending_days - max(0.0, days - reserved_days(ctx))
            if remaining < 0:
                reasons.append(f"Vượt quỹ phép {code}: thiếu {-remaining:g} ngày")

    if code == "UNPAID" and days > settings.leave_unpaid_max_auto_days:
        reasons.append(f"Nghỉ không lương {days:g} ngày, vượt {settings.leave_unpaid_max_auto_days:g} ngày AI được tự quyết")
    if code == "SICK" and days > settings.leave_sick_cert_after_days and not ctx.request.attachments:
        reasons.append(
            f"Nghỉ ốm {days:g} ngày mà không có giấy khám bệnh (bắt buộc khi trên {settings.leave_sick_cert_after_days:g} ngày)"
        )
    return reasons


def build_leave_prompt(ctx: LeaveContext, settings: Settings) -> BuiltPrompt:
    prompt = load_prompt("leave_decision")
    payload = ctx.payload
    days = days_requested(ctx)
    balance = ctx.balance()
    limits = check_limits(ctx, settings)

    request_info = {
        "id": ctx.request.id,
        "leaveType": ctx.leave_type_code(payload),
        "startDate": day_label(payload.start_date),
        "endDate": day_label(payload.end_date),
        "halfDay": payload.half_day,
        "daysRequested": days,
        "calendarDaysUntilStart": (payload.start_date - ctx.today).days,
        "attachmentCount": len(ctx.request.attachments),
        "createdBy": ctx.request.created_by_type.value,
    }
    employee = mask_for_llm(ctx.employee.model_dump(mode="json", by_alias=True, exclude={"id"}))
    if ctx.employee.join_date:
        employee["monthsSinceJoin"] = (ctx.today - ctx.employee.join_date).days // 30
    shown_from = ctx.today - timedelta(days=HISTORY_DAYS)
    history = []
    for past in ctx.history:  # Metadata only: past reasons are neither needed nor trusted
        if past.created_at.astimezone(company_tz()).date() < shown_from:
            continue
        try:
            past_payload = past.leave_payload()
        except ValidationError:
            continue  # Counted in check_limits
        history.append(
            {
                "leaveType": ctx.leave_type_code(past_payload),
                "startDate": day_label(past_payload.start_date),
                "endDate": day_label(past_payload.end_date),
                "days": past.computed.get("daysRequested"),
                "status": past.status.value,
            }
        )

    user = "\n\n".join(
        [
            f"## Today\n{day_label(ctx.today)}",
            f"## Request\n{to_json(request_info)}",
            f"## Reason\n{wrap_untrusted(redact_text(payload.reason), 'reason')}",
            f"## Employee\n{to_json(employee)}",
            f"## Balance for this leave type\n{to_json(balance.to_api() if balance else None)}",
            f"## Limit findings (computed by code)\n{to_json(limits)}",
            f"## Leave history (last {HISTORY_DAYS} days, this request excluded)\n{to_json(history)}",
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
        days_requested=days,
    )
