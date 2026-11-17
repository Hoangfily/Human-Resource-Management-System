from dataclasses import replace
from datetime import date
from typing import Any

import pytest
from pydantic import ValidationError

from app.agents.attendance_agent import (
    build_attendance_prompt,
    check_limits,
    gather_attendance_context,
    impact_minutes,
    working_days_after,
)
from app.config import get_settings
from app.mock_api.fixtures import MockStore, default_employee
from app.schemas.requests import AttendanceExplanationPayload
from app.tools.base import ApiClient
from app.tools.read_tools import get_attendance_events, get_request

pytestmark = pytest.mark.anyio

TODAY = date(2026, 10, 19)  # Monday
FRI = "2026-10-16"
SETTINGS = replace(
    get_settings(),
    ai_max_auto_payroll_hours=4,
    att_explain_within_days=3,
    att_shift_tolerance_minutes=60,
    att_major_deviation_minutes=120,
    att_evidence_after_minutes=30,
    att_max_auto_per_month=3,
)


def att_request(request_id: str, payload: dict[str, Any], **extra: Any) -> dict[str, Any]:
    return {
        "id": request_id,
        "type": "ATTENDANCE_EXPLANATION",
        "status": extra.pop("status", "PENDING"),
        "employeeId": "emp-001",
        "payload": {"explanation": "Quên chấm công", **payload},
        "computed": {},
        "attachments": extra.pop("attachments", []),
        "submittedAt": "2026-10-19T02:00:00Z",
        "createdAt": extra.pop("createdAt", "2026-10-19T01:55:00Z"),
        "updatedAt": "2026-10-19T02:00:00Z",
    }


def add_events(store: MockStore, *events: tuple[str, str], employee: str = "emp-001") -> None:
    for i, (kind, utc) in enumerate(events):
        store.attendance_events.append({"id": f"ev-{i}", "employeeId": employee, "type": kind, "timestamp": utc})


async def context(api: ApiClient, request_id: str = "a1"):
    return await gather_attendance_context(api, await get_request(api, request_id), TODAY)


# ---- payload ----
def test_payload_accepts_web_fields_and_times() -> None:
    web = AttendanceExplanationPayload.model_validate(
        {"date": FRI, "explanationType": "FORGOT_CHECK_IN", "reason": "Quên", "requestedTime": "08:30"}
    )
    assert (web.issue, web.explanation) == ("MISSING_CLOCK_IN", "Quên")
    assert f"{web.requested():%Y-%m-%d %H:%M %z}" == "2026-10-16 08:30 +0700"
    iso = AttendanceExplanationPayload.model_validate(
        {"date": FRI, "issue": "WRONG_TIME", "explanation": "x", "requestedTime": "2026-10-16T01:28:00Z"}
    )
    assert f"{iso.requested():%H:%M}" == "08:28"
    for bad in ({"issue": "DANCING"}, {"issue": "LATE", "requestedTime": "8h30"}):
        with pytest.raises(ValidationError):
            AttendanceExplanationPayload.model_validate({"date": FRI, "explanation": "x", **bad})


def test_working_days_after_skips_weekend() -> None:
    assert working_days_after(date(2026, 10, 16), date(2026, 10, 19)) == 1  # Fri -> Mon
    assert working_days_after(date(2026, 10, 12), date(2026, 10, 19)) == 5


# ---- events ----
async def test_events_missing_route_means_no_data(api: ApiClient, store: MockStore) -> None:
    add_events(store, ("CLOCK_IN", "2026-10-16T01:25:00Z"))
    assert len(await get_attendance_events(api, "emp-001", date(2026, 10, 15), date(2026, 10, 17)) or []) == 1
    store.missing_paths.add("/attendance/events")
    assert await get_attendance_events(api, "emp-001", date(2026, 10, 15), date(2026, 10, 17)) is None


async def test_events_of_another_person_are_not_trusted(api: ApiClient, monkeypatch) -> None:
    # Like apps/api /attendance/history today: it answers with the caller's own events.
    async def caller_events(path: str, params: dict | None = None) -> list[dict]:
        return [{"id": "x", "employeeId": "ai-service", "type": "CLOCK_IN", "timestamp": "2026-10-16T01:00:00Z"}]

    monkeypatch.setattr(api, "get", caller_events)
    assert await get_attendance_events(api, "emp-001", date(2026, 10, 15), date(2026, 10, 17)) is None


async def test_events_are_cut_to_the_local_day(api: ApiClient, store: MockStore) -> None:
    store.add_request(att_request("a1", {"date": FRI, "issue": "LATE"}))
    add_events(
        store,
        ("CLOCK_IN", "2026-10-15T17:30:00Z"),  # 00:30 on the 16th in Vietnam: counts
        ("CLOCK_OUT", "2026-10-16T17:30:00Z"),  # 00:30 on the 17th: does not
    )
    ctx = await context(api)
    assert [e.id for e in ctx.events or []] == ["ev-0"]


# ---- impact ----
@pytest.mark.parametrize(
    ("payload", "events", "expected"),
    [
        ({"issue": "MISSING_CLOCK_OUT", "requestedTime": "17:35"}, [("CLOCK_IN", "2026-10-16T01:25:00Z")], 5),
        ({"issue": "MISSING_CLOCK_IN", "requestedTime": "08:00"}, [("CLOCK_OUT", "2026-10-16T10:30:00Z")], 30),
        ({"issue": "LATE"}, [("CLOCK_IN", "2026-10-16T01:50:00Z")], 20),
        ({"issue": "EARLY_LEAVE"}, [("CLOCK_IN", "2026-10-16T01:30:00Z"), ("CLOCK_OUT", "2026-10-16T09:30:00Z")], 60),
        ({"issue": "WRONG_TIME", "attendanceEventId": "ev-0", "requestedTime": "08:28"}, [("CLOCK_IN", "2026-10-16T02:05:00Z")], 37),
    ],
)
async def test_impact_minutes(api: ApiClient, store: MockStore, payload, events, expected) -> None:
    store.add_request(att_request("a1", {"date": FRI, **payload}))
    add_events(store, *events)
    minutes, problems = impact_minutes(await context(api))
    assert (minutes, problems) == (expected, [])


async def test_wrong_time_needs_the_original_record(api: ApiClient, store: MockStore) -> None:
    store.add_request(att_request("a1", {"date": FRI, "issue": "WRONG_TIME", "attendanceEventId": "nope", "requestedTime": "08:30"}))
    add_events(store, ("CLOCK_IN", "2026-10-16T02:05:00Z"))
    minutes, problems = impact_minutes(await context(api))
    assert minutes is None and problems == ["Không tìm thấy bản ghi chấm công cần sửa"]


# ---- limits ----
async def test_duplicates_and_monthly_count_ignore_rejected(api: ApiClient, store: MockStore) -> None:
    store.add_request(att_request("a1", {"date": FRI, "issue": "MISSING_CLOCK_OUT", "requestedTime": "17:35"}))
    add_events(store, ("CLOCK_IN", "2026-10-16T01:25:00Z"))
    store.add_request(att_request("dup", {"date": FRI, "issue": "MISSING_CLOCK_OUT"}, status="PENDING", createdAt="2026-10-17T01:00:00Z"))
    for i, day in enumerate(("2026-10-02", "2026-10-05", "2026-10-07")):
        store.add_request(att_request(f"r{i}", {"date": day, "issue": "LATE"}, status="REJECTED", createdAt=f"{day}T03:00:00Z"))
    reasons = check_limits(await context(api), SETTINGS)
    assert reasons == ["Đã có đơn giải trình khác cho cùng ngày và cùng lỗi"]  # Rejected ones do not count


async def test_evidence_required_only_above_threshold(api: ApiClient, store: MockStore) -> None:
    store.add_request(att_request("a1", {"date": FRI, "issue": "LATE"}))
    add_events(store, ("CLOCK_IN", "2026-10-16T02:15:00Z"))  # 45 minutes late
    assert any("không có bằng chứng" in r for r in check_limits(await context(api), SETTINGS))
    store.requests["a1"]["attachments"] = ["giay-xac-nhan.pdf"]
    assert check_limits(await context(api), SETTINGS) == []


# ---- prompt ----
async def test_prompt_content_and_privacy(api: ApiClient, store: MockStore) -> None:
    store.add_request(att_request("a1", {"date": FRI, "issue": "LATE", "explanation": "Kẹt xe, gọi em 0912345678"}))
    add_events(store, ("CLOCK_IN", "2026-10-16T01:50:00Z"))
    built = build_attendance_prompt(await context(api), SETTINGS)
    assert built.prompt_version == "attendance_decision@1"
    assert '"impactMinutes": 20' in built.user and '"time": "08:50"' in built.user
    assert '<untrusted field="explanation">' in built.user and "[PHONE]" in built.user
    for secret in (default_employee()["email"], default_employee()["fullName"], "0912345678"):
        assert secret not in built.user


async def test_prompt_marks_missing_attendance_data(api: ApiClient, store: MockStore) -> None:
    store.add_request(att_request("a1", {"date": FRI, "issue": "LATE"}))
    store.missing_paths.add("/attendance/events")
    built = build_attendance_prompt(await context(api), SETTINGS)
    assert "## Clock events on that day (null = not available)\nnull" in built.user
    assert built.limit_reasons == ["Không đọc được dữ liệu chấm công gốc để đối chiếu"]


async def test_explaining_a_future_day_or_an_unfinished_shift(api: ApiClient, store: MockStore) -> None:
    store.add_request(att_request("a1", {"date": "2026-10-20", "issue": "MISSING_CLOCK_OUT", "requestedTime": "17:30"}))
    assert "Giải trình cho ngày chưa tới" in check_limits(await context(api), SETTINGS)
    store.add_request(att_request("a2", {"date": "2026-10-19", "issue": "MISSING_CLOCK_OUT", "requestedTime": "17:30"}))
    assert "Giải trình khi ca làm chưa kết thúc" in check_limits(await context(api, "a2"), SETTINGS)  # Filed 09:00


async def test_unreadable_old_explanations_escalate(api: ApiClient, store: MockStore) -> None:
    store.add_request(att_request("a1", {"date": FRI, "issue": "MISSING_CLOCK_OUT", "requestedTime": "17:35"}))
    add_events(store, ("CLOCK_IN", "2026-10-16T01:25:00Z"))
    bad = att_request("old", {"date": "2026-10-07", "issue": "NOT_AN_ISSUE"}, status="APPROVED", createdAt="2026-10-07T03:00:00Z")
    store.add_request(bad)
    assert "Có 1 đơn giải trình cũ không đọc được, không đếm đủ số đơn trong tháng" in check_limits(await context(api), SETTINGS)


# ---- follow-ups after PR #2 ----
async def test_absent_day_cannot_be_rebuilt_from_two_explanations(api: ApiClient, store: MockStore) -> None:
    store.add_request(att_request("in", {"date": FRI, "issue": "MISSING_CLOCK_IN", "requestedTime": "08:30"}))
    store.add_request(att_request("out", {"date": FRI, "issue": "MISSING_CLOCK_OUT", "requestedTime": "17:30"}))
    # No clock events at all that day
    assert "Ngày này không có giờ ra nào, không đủ căn cứ là đã đi làm" in check_limits(await context(api, "in"), SETTINGS)
    assert "Ngày này không có giờ vào nào, không đủ căn cứ là đã đi làm" in check_limits(await context(api, "out"), SETTINGS)
