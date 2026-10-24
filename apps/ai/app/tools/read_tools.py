"""Read-only tools that call the HR API (docs/02-agent-tools.md)."""

from datetime import date

from ..schemas.common import RequestType
from ..schemas.requests import (
    AttendanceEvent,
    AutonomyConfig,
    EmployeeContext,
    LeaveBalance,
    Policy,
    PolicySet,
    RequestDetail,
    ScheduleEntry,
    ShiftTemplate,
    company_tz,
)
from .base import ApiClient, ApiError


async def get_request(api: ApiClient, request_id: str) -> RequestDetail:
    return RequestDetail.model_validate(await api.get(f"/requests/{request_id}"))


async def get_employee(api: ApiClient, employee_id: str) -> EmployeeContext:
    return EmployeeContext.model_validate(await api.get(f"/employees/{employee_id}"))


async def get_leave_balance(api: ApiClient, employee_id: str) -> list[LeaveBalance]:
    body = await api.get("/leave/balance", params={"employeeId": employee_id})
    return [LeaveBalance.model_validate(b) for b in body["balances"]]


async def list_requests(
    api: ApiClient,
    employee_id: str,
    *,
    type: RequestType | None = None,
    since: date | None = None,
    page_size: int = 100,
    max_pages: int = 20,
) -> list[RequestDetail]:
    """GET /requests is a plain array, newest first, paged with limit/offset, without a date filter.

    Pages are read until a short page or until rows are older than `since` (company-time date),
    so monthly/yearly totals are not cut at the first page.
    """
    tz = company_tz()
    requests: list[RequestDetail] = []
    for page in range(max_pages):
        params = {
            "employeeId": employee_id,
            "type": type.value if type else None,
            "limit": page_size,
            "offset": page * page_size,
        }
        rows = [RequestDetail.model_validate(r) for r in await api.get("/requests", params=params)]
        requests.extend(rows)
        if len(rows) < page_size or (since and rows and rows[-1].created_at.astimezone(tz).date() < since):
            break
    if since:
        requests = [r for r in requests if r.created_at.astimezone(tz).date() >= since]
    return requests


async def get_schedules(api: ApiClient, employee_id: str, start: date, end: date) -> list[ScheduleEntry]:
    """GET /shifts/schedules: assigned shifts of one employee between two days (inclusive)."""
    params = {"employeeId": employee_id, "from": start.isoformat(), "to": end.isoformat()}
    return [ScheduleEntry.model_validate(s) for s in await api.get("/shifts/schedules", params=params)]


async def get_shift_templates(api: ApiClient) -> list[ShiftTemplate]:
    return [ShiftTemplate.model_validate(t) for t in await api.get("/shifts/templates")]


async def get_department_schedules(
    api: ApiClient, department_id: str, start: date, end: date
) -> list[ScheduleEntry] | None:
    """GET /shifts/schedules?departmentId=: everyone's shifts in a department (not in apps/api yet).

    None means "cannot count staff": the route is missing, or it ignored departmentId and
    answered with rows of another department (apps/api today returns the caller's own rows).
    """
    params = {"departmentId": department_id, "from": start.isoformat(), "to": end.isoformat()}
    try:
        rows = [ScheduleEntry.model_validate(s) for s in await api.get("/shifts/schedules", params=params)]
    except ApiError as exc:
        if exc.status == 404:
            return None
        raise
    if any(r.department_id != department_id for r in rows):
        return None
    return rows


async def get_attendance_events(
    api: ApiClient, employee_id: str, start: date, end: date
) -> list[AttendanceEvent] | None:
    """GET /attendance/events: raw clock events of one employee (not in apps/api yet).

    None means "no trustworthy data": the route does not exist (404) or it answered with
    another person's events. Callers must then escalate instead of guessing.
    """
    params = {"employeeId": employee_id, "from": start.isoformat(), "to": end.isoformat()}
    try:
        rows = await api.get("/attendance/events", params=params)
    except ApiError as exc:
        if exc.status == 404:
            return None
        raise
    events = [AttendanceEvent.model_validate(r) for r in rows]
    if any(e.employee_id != employee_id for e in events):
        return None
    return events


async def get_policies(api: ApiClient) -> PolicySet:
    """GET /policy returns the active policies as a plain array."""
    items = [Policy.model_validate(p) for p in await api.get("/policy")]
    return PolicySet(version=items[0].version if items else "unknown", items=items)


async def get_autonomy_config(api: ApiClient, request_type: RequestType) -> AutonomyConfig:
    """GET /agent/autonomy-config returns an array. A missing type means the most restrictive level."""
    for item in await api.get("/agent/autonomy-config"):
        config = AutonomyConfig.model_validate(item)
        if config.request_type == request_type:
            return config
    return AutonomyConfig(request_type=request_type)
