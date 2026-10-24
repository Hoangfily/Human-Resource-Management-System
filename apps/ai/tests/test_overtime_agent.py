from dataclasses import replace
from datetime import date
from typing import Any

import pytest
from pydantic import ValidationError

from app.agents.overtime_agent import (
    build_overtime_prompt,
    check_limits,
    counted_hours,
    gather_overtime_context,
    shift_window,
)
from app.config import get_settings
from app.guardrails.policy import apply_autonomy
from app.mock_api.fixtures import MockStore, default_employee
from app.schemas.common import AutonomyLevel, FinalAction, RequestType
from app.schemas.decision import LLMAssessment
from app.schemas.requests import AutonomyConfig, OvertimePayload
from app.tools.base import ApiClient
from app.tools.read_tools import get_request

pytestmark = pytest.mark.anyio

TODAY = date(2026, 10, 19)  # Monday
SETTINGS = replace(
    get_settings(),
    ai_max_auto_payroll_hours=4,
    ot_max_total_hours_per_day=12,
    ot_max_hours_per_month=40,
    ot_max_hours_per_year=200,
)


def ot_request(request_id: str, day: str, start: str, end: str, **extra: Any) -> dict[str, Any]:
    return {
        "id": request_id,
        "type": "OVERTIME",
        "status": extra.pop("status", "PENDING"),
        "employeeId": "emp-001",
        "payload": {"date": day, "startTime": start, "endTime": end, "reason": extra.pop("reason", "Triển khai bản 2.3")},
        "computed": {},
        "attachments": [],
        "submittedAt": extra.pop("submittedAt", "2026-10-19T02:00:00Z"),
        "createdAt": extra.pop("createdAt", "2026-10-19T01:55:00Z"),
        "updatedAt": "2026-10-19T02:00:00Z",
    }


async def context(api: ApiClient, store: MockStore, request_id: str = "ot-1"):
    return await gather_overtime_context(api, await get_request(api, request_id), TODAY)


# ---- payload ----
def test_payload_validation_and_hours() -> None:
    p = OvertimePayload.model_validate({"date": "2026-10-21", "startTime": "18:00", "endTime": "20:30", "reason": "x"})
    assert p.hours() == 2.5
    iso = OvertimePayload.model_validate(
        {"date": "2026-10-20T17:00:00.000Z", "startTime": "18:00", "endTime": "19:00", "reason": "x"}
    )
    assert iso.date == date(2026, 10, 21)  # Midnight in Vietnam
    for bad in ({"startTime": "6pm", "endTime": "20:00"}, {"startTime": "20:00", "endTime": "18:00"}):
        with pytest.raises(ValidationError):
            OvertimePayload.model_validate({"date": "2026-10-21", "reason": "x", **bad})


# ---- shift ----
async def test_default_shift_on_weekdays_only(api: ApiClient, store: MockStore) -> None:
    store.add_request(ot_request("ot-1", "2026-10-21", "18:00", "20:00"))  # Wednesday
    store.add_request(ot_request("ot-2", "2026-10-24", "08:00", "11:00"))  # Saturday
    weekday = shift_window(await context(api, store, "ot-1"))
    assert weekday and (weekday.source, f"{weekday.start:%H:%M}", f"{weekday.end:%H:%M}") == ("defaultShift", "08:30", "17:30")
    assert shift_window(await context(api, store, "ot-2")) is None


async def test_assigned_schedule_wins_over_default_shift(api: ApiClient, store: MockStore) -> None:
    store.add_request(ot_request("ot-1", "2026-10-22", "08:00", "11:00"))
    store.schedules.append(
        {"id": "s1", "employeeId": "emp-001", "date": "2026-10-22T00:00:00.000Z",
         "shiftStart": "2026-10-22T06:00:00.000Z", "shiftEnd": "2026-10-22T15:00:00.000Z"}
    )
    window = shift_window(await context(api, store))
    assert window and (window.source, f"{window.start:%H:%M}", f"{window.end:%H:%M}") == ("schedule", "13:00", "22:00")


# ---- totals and limits ----
async def test_counted_hours_only_live_requests_of_same_month_and_year(api: ApiClient, store: MockStore) -> None:
    store.add_request(ot_request("ot-1", "2026-10-21", "18:00", "20:00"))
    store.add_request(ot_request("h1", "2026-10-07", "18:00", "21:00", status="APPROVED", createdAt="2026-10-06T01:00:00Z"))
    store.add_request(ot_request("h2", "2026-10-08", "18:00", "21:00", status="PENDING", createdAt="2026-10-07T01:00:00Z"))
    store.add_request(ot_request("h3", "2026-10-09", "18:00", "21:00", status="REJECTED", createdAt="2026-10-08T01:00:00Z"))
    store.add_request(ot_request("h4", "2026-09-09", "18:00", "20:00", status="APPROVED", createdAt="2026-09-08T01:00:00Z"))
    bad = ot_request("h5", "2026-10-10", "18:00", "20:00", status="APPROVED", createdAt="2026-10-09T01:00:00Z")
    bad["payload"]["startTime"] = "broken"
    store.add_request(bad)
    assert counted_hours(await context(api, store)) == (6, 8)  # Month: h1+h2; year: + h4; h3 and h5 ignored


async def test_limits_are_reported_in_vietnamese(api: ApiClient, store: MockStore) -> None:
    store.add_request(ot_request("ot-1", "2026-10-21", "16:00", "21:00", submittedAt="2026-10-21T10:00:00Z"))
    reasons = check_limits(await context(api, store), SETTINGS)
    assert any("vượt giới hạn AI tự quyết (4 giờ)" in r for r in reasons)  # 5 hours
    assert any("OT hồi tố" in r for r in reasons)  # Submitted 17:00, OT started 16:00
    assert any("trùng với ca làm" in r for r in reasons)
    assert any("Tổng giờ làm trong ngày 14 giờ" in r for r in reasons)


async def test_clean_request_has_no_limit_findings(api: ApiClient, store: MockStore) -> None:
    store.add_request(ot_request("ot-1", "2026-10-21", "18:00", "20:00"))
    assert check_limits(await context(api, store), SETTINGS) == []


# ---- prompt ----
async def test_prompt_content_and_privacy(api: ApiClient, store: MockStore) -> None:
    store.add_request(ot_request("ot-1", "2026-10-21", "18:00", "22:00", reason="Gọi em 0912345678 nếu cần"))
    built = build_overtime_prompt(await context(api, store), SETTINGS)
    assert built.prompt_version == "overtime_decision@1" and built.days_requested is None
    for section in ("## Request", "## Shift on that day", "## Overtime totals", "## Limit findings", "## Policies"):
        assert section in built.user
    assert '"hours": 4.0' in built.user and "2026-10-21 (Thứ 4)" in built.user
    assert built.limit_reasons and "Tổng giờ làm trong ngày 13 giờ" in built.user
    assert "[PHONE]" in built.user
    for secret in (default_employee()["email"], default_employee()["fullName"], "0912345678"):
        assert secret not in built.user


def test_limit_reasons_force_escalation_in_guard() -> None:
    assessment = LLMAssessment(
        decision="APPROVED", risk_level="LOW", confidence=0.95, policy_refs=["OT.MAX_HOURS_PER_MONTH"],
        rationale="ok", employee_message="ok",
    )
    config = AutonomyConfig(request_type=RequestType.OVERTIME, level=AutonomyLevel.AUTO_APPROVE_LOW_RISK)
    result = apply_autonomy(
        assessment, config, known_policy_keys={"OT.MAX_HOURS_PER_MONTH"}, global_min_confidence=0.85,
        limit_reasons=["OT hồi tố"],
    )
    assert result.action is FinalAction.ESCALATE and result.reasons == ["OT hồi tố"]


async def test_ot_registered_in_advance_counts_in_its_own_year(api: ApiClient, store: MockStore) -> None:
    # Created in December for January: still part of the year when evaluating in July.
    store.add_request(ot_request("jan", "2026-01-05", "18:00", "21:00", status="APPROVED", createdAt="2025-12-20T03:00:00Z"))
    store.add_request(ot_request("ot-1", "2026-07-20", "18:00", "20:00"))
    ctx = await gather_overtime_context(api, await get_request(api, "ot-1"), date(2026, 7, 15))
    assert counted_hours(ctx) == (0, 3)


async def test_unreadable_old_ot_escalates_because_totals_may_be_low(api: ApiClient, store: MockStore) -> None:
    store.add_request(ot_request("ot-1", "2026-10-21", "18:00", "20:00"))
    bad = ot_request("h1", "2026-10-07", "18:00", "21:00", status="APPROVED", createdAt="2026-10-06T01:00:00Z")
    bad["payload"]["startTime"] = "broken"
    store.add_request(bad)
    assert "Có 1 đơn OT cũ không đọc được, tổng giờ tháng/năm có thể bị thiếu" in check_limits(await context(api, store), SETTINGS)


async def test_other_ot_on_the_same_day_counts_and_must_not_overlap(api: ApiClient, store: MockStore) -> None:
    store.add_request(ot_request("ot-1", "2026-10-21", "18:00", "22:00"))
    store.add_request(ot_request("same", "2026-10-21", "18:00", "20:00", status="APPROVED", createdAt="2026-10-18T03:00:00Z"))
    reasons = check_limits(await context(api, store), SETTINGS)
    assert "Trùng giờ với đơn OT khác cùng ngày (18:00–20:00)" in reasons
    assert any("Tổng giờ làm trong ngày 15 giờ" in r for r in reasons)  # 9 + 2 + 4


async def test_rows_the_api_returned_unparsed_also_escalate(api: ApiClient, store: MockStore, monkeypatch) -> None:
    from app.tools.read_tools import RequestHistory

    store.add_request(ot_request("ot-1", "2026-10-21", "18:00", "20:00"))
    ctx = await context(api, store)
    ctx = replace(ctx, history=RequestHistory(list(ctx.history), skipped=2))
    assert "Có 2 đơn OT cũ không đọc được, tổng giờ tháng/năm có thể bị thiếu" in check_limits(ctx, SETTINGS)
