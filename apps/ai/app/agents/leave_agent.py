"""LEAVE decision: gather the context from the API and build the LLM prompt.

Only what the decision needs reaches the LLM: no contact details, no reasons from
past requests, attachment count instead of URLs.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from ..guardrails.pii import mask_for_llm, redact_text
from ..guardrails.untrusted import detect_injection, wrap_untrusted
from ..prompts import load_prompt
from ..schemas.common import RequestType
from ..schemas.requests import EmployeeContext, LeaveBalance, LeavePayload, PolicySet, RequestDetail
from ..tools.base import ApiClient
from ..tools.read_tools import get_employee, get_leave_balance, get_policies, list_requests
from .base import BuiltPrompt, day_label, policy_lines, to_json

HISTORY_DAYS = 90


@dataclass(frozen=True)
class LeaveContext:
    request: RequestDetail
    payload: LeavePayload
    employee: EmployeeContext
    balances: list[LeaveBalance]
    history: list[RequestDetail]  # Other LEAVE requests of the employee, last HISTORY_DAYS days
    policies: PolicySet
    today: date

    def _balance_for(self, payload: LeavePayload) -> LeaveBalance | None:
        """Match by leaveTypeId; fall back to the code when the API could not resolve the id."""
        by_id = next((b for b in self.balances if payload.leave_type_id and b.leave_type_id == payload.leave_type_id), None)
        return by_id or next((b for b in self.balances if b.leave_type_code == payload.leave_type), None)

    def leave_type_code(self, payload: LeavePayload) -> str:
        balance = self._balance_for(payload)
        return balance.leave_type_code if balance else (payload.leave_type or "UNKNOWN")

    def balance(self) -> LeaveBalance | None:
        return self._balance_for(self.payload)


async def gather_leave_context(api: ApiClient, request: RequestDetail, today: date) -> LeaveContext:
    employee = await get_employee(api, request.employee_id)
    balances = await get_leave_balance(api, request.employee_id)
    since = today - timedelta(days=HISTORY_DAYS)
    history = [
        r
        for r in await list_requests(api, request.employee_id, type=RequestType.LEAVE, since=since)
        if r.id != request.id
    ]
    policies = await get_policies(api)
    return LeaveContext(request, request.leave_payload(), employee, balances, history, policies, today)


def count_working_days(start: date, end: date, half_day: str | None = None) -> float:
    """Mon-Fri days in [start, end]. Fallback only: the API's count also skips holidays."""
    if half_day:
        return 0.5
    days = sum(1 for i in range((end - start).days + 1) if (start + timedelta(days=i)).weekday() < 5)
    return float(days)


def days_requested(ctx: LeaveContext) -> float:
    computed = ctx.request.computed.get("daysRequested")
    if computed is not None:
        return float(computed)
    return count_working_days(ctx.payload.start_date, ctx.payload.end_date, ctx.payload.half_day)


def build_leave_prompt(ctx: LeaveContext) -> BuiltPrompt:
    prompt = load_prompt("leave_decision")
    payload = ctx.payload
    days = days_requested(ctx)
    reason = redact_text(payload.reason)
    balance = ctx.balance()

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
    history = []
    for past in ctx.history:  # Metadata only: past reasons are neither needed nor trusted
        past_payload = past.leave_payload()
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
            f"## Reason\n{wrap_untrusted(reason, 'reason')}",
            f"## Employee\n{to_json(employee)}",
            f"## Balance for this leave type\n{to_json(balance.to_api() if balance else None)}",
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
        days_requested=days,
    )
