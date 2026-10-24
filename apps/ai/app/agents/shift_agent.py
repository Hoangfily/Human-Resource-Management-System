"""SHIFT_CHANGE decision: gather the context from the API and build the LLM prompt.

Notice period, rest between shifts, conflicts and staff left on the old shift are checked
here in code and returned as `limit_reasons`. A swap with a colleague always escalates:
the API does not record whether the colleague agreed (docs/05-business-spec.md §6.4).
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from ..config import Settings
from ..guardrails.pii import mask_for_llm, redact_text
from ..guardrails.untrusted import detect_injection, wrap_untrusted
from ..prompts import load_prompt
from ..schemas.common import RequestType
from ..schemas.requests import (
    EmployeeContext,
    PolicySet,
    RequestDetail,
    ScheduleEntry,
    ShiftChangePayload,
    ShiftTemplate,
    company_tz,
)
from ..tools.base import ApiClient
from ..tools.read_tools import (
    get_department_schedules,
    get_employee,
    get_policies,
    get_schedules,
    get_shift_templates,
    list_requests,
)
from .base import BuiltPrompt, day_label, policy_lines, to_json
from .shifts import ShiftWindow, shift_for_day

HISTORY_DAYS = 90
LOOKUP_DAYS = (30, 90)  # Window searched for a scheduleId: days back, days ahead


@dataclass(frozen=True)
class ShiftContext:
    request: RequestDetail
    payload: ShiftChangePayload
    employee: EmployeeContext
    base_date: date | None  # Day of the shift being changed
    current: ScheduleEntry | None  # Its schedule row, if it has one
    own_schedules: list[ScheduleEntry]  # The employee's rows around both days
    template: ShiftTemplate | None  # The new shift
    department: list[ScheduleEntry] | None  # Everyone's rows that day; None = cannot count
    history: list[RequestDetail]
    policies: PolicySet
    today: date

    @property
    def new_date(self) -> date | None:
        return self.payload.new_date or self.base_date

    def schedule_on(self, day: date) -> ScheduleEntry | None:
        return next((s for s in self.own_schedules if s.date == day and s.id != (self.current.id if self.current else None)), None)

    def old_window(self) -> ShiftWindow | None:
        if self.base_date is None:
            return None
        return shift_for_day(self.base_date, self.current, self.employee)

    def new_window(self) -> ShiftWindow | None:
        if self.template is None or self.new_date is None:
            return None
        tz = company_tz()
        start = datetime.combine(self.new_date, datetime.strptime(self.template.start_time, "%H:%M").time(), tz)
        end = datetime.combine(self.new_date, datetime.strptime(self.template.end_time, "%H:%M").time(), tz)
        if end <= start:
            end += timedelta(days=1)  # Night shift
        return ShiftWindow(start, end, "template")

    def neighbour(self, day: date) -> ShiftWindow | None:
        """The shift on a neighbouring day once the change is made."""
        if day == self.base_date and day != self.new_date:
            return None  # That shift is the one being moved away
        return shift_for_day(day, self.schedule_on(day), self.employee)


async def gather_shift_context(api: ApiClient, request: RequestDetail, today: date) -> ShiftContext:
    payload = request.shift_change_payload()
    employee = await get_employee(api, request.employee_id)
    templates = await get_shift_templates(api)

    current, base_date = None, payload.shift_date
    if payload.schedule_id:
        back, ahead = LOOKUP_DAYS
        rows = await get_schedules(api, request.employee_id, today - timedelta(days=back), today + timedelta(days=ahead))
        current = next((s for s in rows if s.id == payload.schedule_id), None)
        base_date = current.date if current else base_date

    days = [d for d in (base_date, payload.new_date) if d]
    own = await get_schedules(api, request.employee_id, min(days) - timedelta(days=1), max(days) + timedelta(days=1)) if days else []
    if current is None and base_date:
        current = next((s for s in own if s.date == base_date), None)

    department = None
    if base_date and employee.department_id:
        department = await get_department_schedules(api, employee.department_id, base_date, base_date)

    history = [
        r
        for r in await list_requests(api, request.employee_id, type=RequestType.SHIFT_CHANGE, since=today - timedelta(days=HISTORY_DAYS))
        if r.id != request.id
    ]
    policies = await get_policies(api)
    template = next((t for t in templates if t.id == payload.new_shift_template_id), None)
    return ShiftContext(request, payload, employee, base_date, current, own, template, department, history, policies, today)


def _hours(delta: timedelta) -> float:
    return round(delta.total_seconds() / 3600, 1)


def check_limits(ctx: ShiftContext, settings: Settings) -> list[str]:
    p = ctx.payload
    reasons: list[str] = []
    old, new = ctx.old_window(), ctx.new_window()

    if ctx.template is None:
        reasons.append(f"Không tìm thấy ca mới {p.new_shift_template_id}")
    if ctx.base_date is None:
        reasons.append("Không tìm thấy ca hiện tại cần đổi")
    elif old is None:
        reasons.append(f"Ngày {ctx.base_date:%d/%m} không có ca làm để đổi")
    if p.swap_with_employee_id:
        reasons.append("Đổi ca với đồng nghiệp cần đồng nghiệp xác nhận trước")
    if new is None:
        return reasons

    if old and (old.start, old.end) == (new.start, new.end):
        reasons.append("Ca mới trùng với ca hiện tại")
    other = ctx.schedule_on(new.start.date())
    if other and other.overlaps(new.start, new.end):
        reasons.append(f"Ca mới trùng với ca khác đã phân ngày {new.start:%d/%m}")

    for day in (new.start.date() - timedelta(days=1), new.start.date() + timedelta(days=1)):
        shift = ctx.neighbour(day)
        if shift is None:
            continue
        rest = new.start - shift.end if day < new.start.date() else shift.start - new.end
        if timedelta(0) <= rest < timedelta(hours=settings.shift_min_rest_hours):
            reasons.append(f"Chỉ nghỉ {_hours(rest):g} giờ giữa hai ca, cần tối thiểu {settings.shift_min_rest_hours:g} giờ")

    registered = (ctx.request.submitted_at or ctx.request.created_at).astimezone(company_tz())
    earliest = min(w.start for w in (old, new) if w)
    notice = earliest - registered
    if notice < timedelta(0):
        reasons.append("Đổi ca cho ca đã bắt đầu hoặc đã qua")
    elif notice < timedelta(hours=settings.shift_notice_hours):
        reasons.append(f"Báo trước {_hours(notice):g} giờ, cần tối thiểu {settings.shift_notice_hours:g} giờ")

    if old and not p.swap_with_employee_id:
        if ctx.department is None:
            reasons.append("Không kiểm tra được số người còn lại trong ca cũ")
        else:
            left = sum(
                1 for s in ctx.department if s.employee_id != ctx.request.employee_id and s.overlaps(old.start, old.end)
            )
            if left < settings.shift_min_staff:
                reasons.append(f"Ca cũ chỉ còn {left} người, cần tối thiểu {settings.shift_min_staff}")
    return reasons


def build_shift_prompt(ctx: ShiftContext, settings: Settings) -> BuiltPrompt:
    prompt = load_prompt("shift_decision")
    p = ctx.payload
    old, new = ctx.old_window(), ctx.new_window()
    limits = check_limits(ctx, settings)

    request_info = {
        "id": ctx.request.id,
        "currentDate": day_label(ctx.base_date) if ctx.base_date else None,
        "currentShift": old.to_prompt() if old else None,
        "newDate": day_label(ctx.new_date) if ctx.new_date else None,
        "newShift": {"template": ctx.template.name, **new.to_prompt()} if ctx.template and new else None,
        "swapWithColleague": bool(p.swap_with_employee_id),
        "attachmentCount": len(ctx.request.attachments),
        "createdBy": ctx.request.created_by_type.value,
    }
    staff_left = (
        None
        if ctx.department is None or old is None
        else sum(1 for s in ctx.department if s.employee_id != ctx.request.employee_id and s.overlaps(old.start, old.end))
    )
    employee = mask_for_llm(ctx.employee.model_dump(mode="json", by_alias=True, exclude={"id"}))
    history = [{"createdAt": day_label(r.created_at.astimezone(company_tz()).date()), "status": r.status.value} for r in ctx.history]

    user = "\n\n".join(
        [
            f"## Today\n{day_label(ctx.today)}",
            f"## Request\n{to_json(request_info)}",
            f"## Reason\n{wrap_untrusted(redact_text(p.reason), 'reason')}",
            f"## Employee\n{to_json(employee)}",
            f"## Colleagues left on the current shift (null = not available)\n{to_json(staff_left)}",
            f"## Limit findings (computed by code)\n{to_json(limits)}",
            f"## Shift change history (last {HISTORY_DAYS} days, this request excluded)\n{to_json(history)}",
            f"## Policies (version {ctx.policies.version}). Cite only these keys.\n{policy_lines(ctx.policies)}",
        ]
    )
    return BuiltPrompt(
        system=prompt.text,
        user=user,
        prompt_version=prompt.version,
        policies=ctx.policies,
        injection_flags=detect_injection(p.reason),
        limit_reasons=limits,
    )
