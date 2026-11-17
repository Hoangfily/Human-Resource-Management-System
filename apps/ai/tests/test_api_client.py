from datetime import date

import httpx
import pytest

from app.mock_api.fixtures import MockStore
from app.mock_api.server import create_mock_api
from app.schemas.common import AutonomyLevel, RequestStatus, RequestType, RiskLevel
from app.schemas.decision import AiDecisionInput, EscalateInput, Trace
from app.tools.base import ApiClient, ApiError
from app.tools.read_tools import (
    get_autonomy_config,
    get_employee,
    get_leave_balance,
    get_policies,
    get_request,
    list_requests,
)
from app.tools.write_tools import decide_request, escalate_to_human

pytestmark = pytest.mark.anyio

TRACE = Trace(model="fake", prompt_version="test@1")


def decision(**overrides: object) -> AiDecisionInput:
    fields: dict[str, object] = {
        "decision": "APPROVED",
        "reason": "ok",
        "risk_level": RiskLevel.LOW,
        "confidence": 0.95,
        "policy_refs": ["LEAVE.NOTICE_DAYS"],
        "idempotency_key": "k1",
        "trace": TRACE,
    }
    return AiDecisionInput(**(fields | overrides))  # type: ignore[arg-type]


# ---- read tools ----
async def test_get_request_parses_camel_case(api: ApiClient) -> None:
    req = await get_request(api, "req-demo-1")
    assert req.type is RequestType.LEAVE
    assert req.status is RequestStatus.PENDING
    assert req.leave_payload().start_date == date(2026, 10, 29)
    assert req.computed["daysRequested"] == 2


async def test_get_employee_drops_contact_fields(api: ApiClient) -> None:
    employee = await get_employee(api, "emp-001")
    dumped = employee.model_dump()
    assert employee.status == "ACTIVE"
    assert not {"email", "phone", "full_name", "fullName"} & dumped.keys()


async def test_leave_balance_policies_and_autonomy(api: ApiClient) -> None:
    balances = await get_leave_balance(api, "emp-001")
    annual = next(b for b in balances if b.leave_type_code == "ANNUAL")
    assert annual.available_days == 10

    policies = await get_policies(api)
    assert "LEAVE.NOTICE_DAYS" in policies.keys()

    config = await get_autonomy_config(api, RequestType.LEAVE)
    assert config.level is AutonomyLevel.AUTO_DECIDE_LOW_RISK


async def test_missing_autonomy_config_is_most_restrictive(api: ApiClient, store: MockStore) -> None:
    del store.autonomy["SHIFT_CHANGE"]
    config = await get_autonomy_config(api, RequestType.SHIFT_CHANGE)
    assert config.level is AutonomyLevel.SUGGEST_ONLY


async def test_request_detail_drops_employee_name_from_api(api: ApiClient) -> None:
    req = await get_request(api, "req-demo-1")  # Mock adds employeeName like apps/api
    assert "employee_name" not in req.model_dump() and "Nguyen Van A" not in req.model_dump_json()


async def test_empty_policy_list(api: ApiClient, store: MockStore) -> None:
    store.policies["items"] = []
    policies = await get_policies(api)
    assert (policies.version, policies.keys()) == ("unknown", set())


async def test_list_requests_filters(api: ApiClient) -> None:
    assert len(await list_requests(api, "emp-001", type=RequestType.LEAVE)) == 1
    assert await list_requests(api, "emp-001", type=RequestType.OVERTIME) == []
    assert await list_requests(api, "emp-001", since=date(2026, 11, 1)) == []


# ---- errors, retries, tracing ----
async def test_not_found_maps_to_api_error(api: ApiClient) -> None:
    with pytest.raises(ApiError) as exc:
        await get_request(api, "missing")
    assert (exc.value.status, exc.value.code) == (404, "NOT_FOUND")


async def test_wrong_token_is_rejected(store: MockStore) -> None:
    transport = httpx.ASGITransport(app=create_mock_api(store))
    async with ApiClient("http://mock", "wrong", transport=transport) as client:
        with pytest.raises(ApiError) as exc:
            await get_request(client, "req-demo-1")
    assert exc.value.status == 401


async def test_retries_on_503_then_succeeds(api: ApiClient, store: MockStore) -> None:
    store.fail_next = [503, 503]
    req = await get_request(api, "req-demo-1")
    assert req.id == "req-demo-1"
    assert [c["status"] for c in api.calls] == [503, 503, 200]


async def test_gives_up_after_max_retries(api: ApiClient, store: MockStore) -> None:
    store.fail_next = [503] * 4
    with pytest.raises(ApiError) as exc:
        await get_request(api, "req-demo-1")
    assert exc.value.status == 503
    assert len(api.calls) == 4  # 1 try + 3 retries


async def test_does_not_retry_client_errors(api: ApiClient, store: MockStore) -> None:
    store.fail_next = [400]
    with pytest.raises(ApiError):
        await get_request(api, "req-demo-1")
    assert len(api.calls) == 1


# ---- write tools ----
async def test_ai_decision_applied_and_body_is_camel_case(api: ApiClient, store: MockStore) -> None:
    result = await decide_request(api, "req-demo-1", decision())
    assert (result.status, result.applied) == (RequestStatus.APPROVED, True)
    body = store.writes[-1]["body"]
    assert body["riskLevel"] == "LOW" and body["idempotencyKey"] == "k1"
    assert body["trace"]["promptVersion"] == "test@1"


async def test_api_escalates_when_ai_decision_not_allowed(api: ApiClient, store: MockStore) -> None:
    result = await decide_request(api, "req-demo-1", decision(risk_level=RiskLevel.MEDIUM))
    assert (result.status, result.applied) == (RequestStatus.ESCALATED, False)
    assert "riskLevel MEDIUM" in (result.escalation_reason or "")


async def test_decision_on_non_pending_request_conflicts(api: ApiClient, store: MockStore) -> None:
    store.requests["req-demo-1"]["status"] = "APPROVED"
    with pytest.raises(ApiError) as exc:
        await decide_request(api, "req-demo-1", decision())
    assert exc.value.code == "INVALID_TRANSITION"


async def test_escalate(api: ApiClient, store: MockStore) -> None:
    body = EscalateInput(reason="thiếu giấy tờ", risk_level=RiskLevel.HIGH, idempotency_key="k2")
    result = await escalate_to_human(api, "req-demo-1", body)
    assert result.status is RequestStatus.ESCALATED
    assert store.requests["req-demo-1"]["status"] == "ESCALATED"


# ---- paging and dates (review findings) ----
def _leave(i: int, created: str) -> dict:
    return {
        "id": f"bulk-{i}", "type": "LEAVE", "status": "APPROVED", "employeeId": "emp-001",
        "payload": {"leaveTypeId": "lt-annual", "startDate": "2026-03-02", "endDate": "2026-03-02", "reason": "x"},
        "computed": {"daysRequested": 1}, "attachments": [], "createdAt": created, "updatedAt": created,
    }


async def test_list_requests_reads_every_page(api: ApiClient, store: MockStore) -> None:
    for i in range(230):
        store.add_request(_leave(i, f"2026-0{1 + i % 9}-1{i % 10}T03:00:00Z"))
    assert len(await list_requests(api, "emp-001", type=RequestType.LEAVE)) == 231  # + the demo request
    assert len(api.calls) == 3  # 100 + 100 + 31


async def test_since_uses_the_company_date(api: ApiClient, store: MockStore) -> None:
    store.add_request(_leave(1, "2026-07-26T20:00:00Z"))  # 27/07 03:00 in Vietnam
    ids = [r.id for r in await list_requests(api, "emp-001", since=date(2026, 7, 27))]
    assert "bulk-1" in ids


def _row(request_id: str, employee: str, created: str, type_: str = "LEAVE") -> dict:
    return {**_leave(0, created), "id": request_id, "employeeId": employee, "type": type_}


async def test_list_requests_keeps_only_the_employee_and_type(api: ApiClient, monkeypatch) -> None:
    # The real API does not filter by employeeId for the AI role: everyone's rows come back.
    async def everyone(path: str, params: dict | None = None) -> list[dict]:
        return [
            _row("mine", "emp-001", "2026-10-01T03:00:00Z"),
            _row("theirs", "emp-999", "2026-10-01T03:00:00Z"),
            _row("other-type", "emp-001", "2026-10-01T03:00:00Z", "OVERTIME"),
        ]

    monkeypatch.setattr(api, "get", everyone)
    assert [r.id for r in await list_requests(api, "emp-001", type=RequestType.LEAVE)] == ["mine"]


async def test_list_requests_drops_rows_repeated_across_pages(api: ApiClient, monkeypatch) -> None:
    pages = {
        0: [_row(f"r{i}", "emp-001", "2026-10-01T03:00:00Z") for i in range(2)],
        2: [_row("r1", "emp-001", "2026-10-01T03:00:00Z")],  # Shifted by a new request
    }

    async def paged(path: str, params: dict | None = None) -> list[dict]:
        return pages.get(params["offset"], [])

    monkeypatch.setattr(api, "get", paged)
    rows = await list_requests(api, "emp-001", page_size=2)
    assert sorted(r.id for r in rows) == ["r0", "r1"]


async def test_list_requests_refuses_to_return_a_cut_history(api: ApiClient, monkeypatch) -> None:
    async def endless(path: str, params: dict | None = None) -> list[dict]:
        return [_row(f"r{params['offset'] + i}", "emp-001", "2026-10-01T03:00:00Z") for i in range(2)]

    monkeypatch.setattr(api, "get", endless)
    with pytest.raises(ApiError) as exc:
        await list_requests(api, "emp-001", page_size=2, max_pages=3)
    assert exc.value.code == "HISTORY_TOO_LONG"


async def test_one_unreadable_history_row_is_skipped(api: ApiClient, monkeypatch) -> None:
    async def rows(path: str, params: dict | None = None) -> list[dict]:
        return [_row("ok", "emp-001", "2026-10-01T03:00:00Z"), {**_row("odd", "emp-001", "2026-10-01T03:00:00Z"), "status": "ARCHIVED"}]

    monkeypatch.setattr(api, "get", rows)
    assert [r.id for r in await list_requests(api, "emp-001")] == ["ok"]


async def test_writes_are_not_replayed_after_a_read_timeout() -> None:
    calls = {"GET": 0, "POST": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls[request.method] += 1
        raise httpx.ReadTimeout("no answer", request=request)

    async with ApiClient("http://x", "t", transport=httpx.MockTransport(handler), backoff_s=0) as client:
        with pytest.raises(ApiError) as exc:
            await client.post("/requests/r/ai-decision", json={})
        assert exc.value.code == "WRITE_OUTCOME_UNKNOWN"
        with pytest.raises(ApiError):
            await client.get("/requests/r")
    assert calls == {"POST": 1, "GET": 4}  # Reads are still retried


async def test_writes_are_not_replayed_on_5xx() -> None:
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.method)
        return httpx.Response(503, json={"code": "UNAVAILABLE"})

    async with ApiClient("http://x", "t", transport=httpx.MockTransport(handler), backoff_s=0) as client:
        with pytest.raises(ApiError):
            await client.post("/requests/r/escalate", json={})
    assert calls == ["POST"]
