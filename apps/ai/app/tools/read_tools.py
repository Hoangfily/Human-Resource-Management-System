"""Read-only tools that call the HR API (docs/02-agent-tools.md)."""

from datetime import date

from ..schemas.common import RequestType
from ..schemas.requests import AutonomyConfig, EmployeeContext, LeaveBalance, PolicySet, RequestDetail
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
) -> list[RequestDetail]:
    params = {
        "employeeId": employee_id,
        "type": type.value if type else None,
        "from": since.isoformat() if since else None,
    }
    body = await api.get("/requests", params=params)
    return [RequestDetail.model_validate(r) for r in body["items"]]


async def get_policies(api: ApiClient) -> PolicySet:
    return PolicySet.model_validate(await api.get("/policies"))


async def get_autonomy_config(api: ApiClient, request_type: RequestType) -> AutonomyConfig:
    """Missing config means the most restrictive level (fail safe)."""
    body = await api.get("/autonomy-config")
    for item in body["items"]:
        config = AutonomyConfig.model_validate(item)
        if config.request_type == request_type:
            return config
    return AutonomyConfig(request_type=request_type)
