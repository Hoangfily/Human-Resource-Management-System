"""Mock of the apps/api endpoints the AI uses, with the same paths and response shapes
as the real API (origin/api) so tests reflect what the AI will meet.

Run by hand: `uvicorn app.mock_api.server:app --port 3001`
"""

from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from .fixtures import MockStore, demo_store


class MockApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        self.status, self.code, self.message = status, code, message


def create_mock_api(store: MockStore) -> FastAPI:
    app = FastAPI(title="Mock HR API")

    @app.exception_handler(MockApiError)
    async def _error(_: Request, exc: MockApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status,
            content={"code": exc.code, "message": exc.message, "requestId": "mock"},
        )

    @app.middleware("http")
    async def _inject_failures(request: Request, call_next: Any) -> Any:
        if store.fail_next:
            status = store.fail_next.pop(0)
            return JSONResponse(status_code=status, content={"code": "INJECTED", "message": "fail_next"})
        if any(request.url.path.endswith(suffix) for suffix in store.missing_paths):
            # What NestJS answers for a route that does not exist yet.
            return JSONResponse(status_code=404, content={"message": f"Cannot {request.method} {request.url.path}"})
        return await call_next(request)

    def auth(authorization: str = Header(default="")) -> None:
        if authorization != f"Bearer {store.token}":
            raise HTTPException(status_code=401, detail="Unauthorized")

    api = FastAPI(dependencies=[Depends(auth)])
    app.mount("/api/v1", api)
    api.add_exception_handler(MockApiError, _error)  # type: ignore[arg-type]

    def find_request(request_id: str) -> dict[str, Any]:
        if request_id not in store.requests:
            raise MockApiError(404, "NOT_FOUND", f"Request {request_id} not found")
        return store.requests[request_id]

    def formatted(request: dict[str, Any]) -> dict[str, Any]:
        # Like apps/api formatRequest: adds the employee's name (PII the AI must never pass on).
        name = store.employees.get(request["employeeId"], {}).get("fullName", "Nhân viên")
        return {**request, "employeeName": name}

    @api.get("/requests/{request_id}")
    def get_request(request_id: str) -> dict[str, Any]:
        return formatted(find_request(request_id))

    @api.get("/requests")
    def list_requests(
        employeeId: str, type: str | None = None, limit: int = 50, offset: int = 0
    ) -> list[dict[str, Any]]:
        # Like apps/api: a plain array, newest first, no date filter.
        items = [
            formatted(r)
            for r in store.requests.values()
            if r["employeeId"] == employeeId and (type is None or r["type"] == type)
        ]
        items.sort(key=lambda r: r["createdAt"], reverse=True)
        return items[offset : offset + limit]

    @api.get("/employees/{employee_id}")
    def get_employee(employee_id: str) -> dict[str, Any]:
        if employee_id not in store.employees:
            raise MockApiError(404, "NOT_FOUND", f"Employee {employee_id} not found")
        return store.employees[employee_id]

    @api.get("/leave/balance")
    def get_balance(employeeId: str) -> dict[str, Any]:
        return {"balances": store.balances.get(employeeId, [])}

    @api.get("/shifts/schedules")
    def get_schedules(
        employeeId: str, start: str | None = Query(None, alias="from"), end: str | None = Query(None, alias="to")
    ) -> list[dict[str, Any]]:
        # Like apps/api: one employee, optional inclusive date range, oldest first, employee embedded.
        employee = store.employees.get(employeeId, {})
        rows = [
            {**s, "employee": {"id": employeeId, "fullName": employee.get("fullName"), "email": employee.get("email")}}
            for s in store.schedules
            if s["employeeId"] == employeeId
            and (start is None or s["date"][:10] >= start)
            and (end is None or s["date"][:10] <= end)
        ]
        return sorted(rows, key=lambda s: s["date"])

    # Not in apps/api yet: the AI needs raw events of any employee (docs/01-api-contract.md).
    @api.get("/attendance/events")
    def get_attendance_events(
        employeeId: str, start: str | None = Query(None, alias="from"), end: str | None = Query(None, alias="to")
    ) -> list[dict[str, Any]]:
        rows = [
            e
            for e in store.attendance_events
            if e["employeeId"] == employeeId
            and (start is None or e["timestamp"][:10] >= start)
            and (end is None or e["timestamp"][:10] <= end)
        ]
        return sorted(rows, key=lambda e: e["timestamp"])

    @api.get("/policy")
    def get_policies() -> list[dict[str, Any]]:
        return store.policies["items"]

    @api.get("/agent/autonomy-config")
    def get_autonomy() -> list[dict[str, Any]]:
        return list(store.autonomy.values())

    # Not in apps/api yet (docs/01-api-contract.md: "to build for AI").
    @api.post("/requests/{request_id}/ai-decision")
    async def ai_decision(request_id: str, request: Request) -> dict[str, Any]:
        body = await request.json()
        store.writes.append({"endpoint": "ai-decision", "requestId": request_id, "body": body})
        req = find_request(request_id)
        if req["status"] != "PENDING":
            raise MockApiError(409, "INVALID_TRANSITION", f"Request is {req['status']}")

        # Same re-check the real API must do (docs/05-business-spec.md §7.3).
        config = store.autonomy.get(req["type"], {"level": "SUGGEST_ONLY", "minConfidence": 1})
        allowed = {
            "SUGGEST_ONLY": set(),
            "AUTO_APPROVE_LOW_RISK": {"APPROVED"},
            "AUTO_DECIDE_LOW_RISK": {"APPROVED", "REJECTED"},
        }[config["level"]]
        problems = []
        if body["decision"] not in allowed:
            problems.append(f"{config['level']} không cho phép {body['decision']}")
        if body["riskLevel"] != "LOW":
            problems.append(f"riskLevel {body['riskLevel']}")
        if body["confidence"] < config["minConfidence"]:
            problems.append(f"confidence {body['confidence']} < {config['minConfidence']}")

        if problems:
            req["status"] = "ESCALATED"
            reason = "; ".join(problems)
            return {"id": request_id, "status": "ESCALATED", "applied": False, "escalationReason": reason}
        req["status"] = body["decision"]
        return {"id": request_id, "status": req["status"], "applied": True}

    @api.post("/requests/{request_id}/escalate")
    async def escalate(request_id: str, request: Request) -> dict[str, Any]:
        body = await request.json()
        store.writes.append({"endpoint": "escalate", "requestId": request_id, "body": body})
        req = find_request(request_id)
        if req["status"] not in ("PENDING", "DRAFT"):
            raise MockApiError(409, "INVALID_TRANSITION", f"Request is {req['status']}")
        req["status"] = "ESCALATED"
        return {"id": request_id, "status": "ESCALATED", "applied": True}

    return app


app =create_mock_api(demo_store())
