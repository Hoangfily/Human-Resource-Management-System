"""Read-only tools that call the HR API (docs/02-agent-tools.md)."""

from datetime import date

from ..schemas.common import RequestType
from ..schemas.requests import (
    AutonomyConfig,
    EmployeeContext,
    LeaveBalance,
    Policy,
    PolicySet,
    RequestDetail,
    ScheduleEntry,
)
from .base import ApiClient


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
    limit: int = 100,
) -> list[RequestDetail]:
    """GET /requests returns a plain array (newest first) and has no date filter: `since` is applied here."""
    params = {"employeeId": employee_id, "type": type.value if type else None, "limit": limit}
    requests = [RequestDetail.model_validate(r) for r in await api.get("/requests", params=params)]
    if since:
        requests = [r for r in requests if r.created_at.date() >= since]
    return requests


async def get_schedules(api: ApiClient, employee_id: str, start: date, end: date) -> list[ScheduleEntry]:
    """GET /shifts/schedules: assigned shifts of one employee between two days (inclusive)."""
    params = {"employeeId": employee_id, "from": start.isoformat(), "to": end.isoformat()}
    return [ScheduleEntry.model_validate(s) for s in await api.get("/shifts/schedules", params=params)]


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
