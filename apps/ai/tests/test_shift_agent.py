from dataclasses import replace
from datetime import date
from typing import Any

import pytest
from pydantic import ValidationError

from app.agents.shift_agent import build_shift_prompt, check_limits, gather_shift_context
from app.config import get_settings
from app.mock_api.fixtures import MockStore, default_employee
from app.schemas.requests import ShiftChangePayload
from app.tools.base import ApiClient
from app.tools.read_tools import get_department_schedules, get_request

pytestmark = pytest.mark.anyio

TODAY = date(2026, 10, 19)  # Monday, request submitted 09:00
FRI, THU = "2026-10-23", "2026-10-22"
SETTINGS = replace(get_settings(), shift_notice_hours=48, shift_min_rest_hours=12, shift_min_staff=2)


def shift_request(request_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": request_id,
        "type": "SHIFT_CHANGE",
        "status": "PENDING",
        "employeeId": "emp-001",
        "payload": {"reason": "Khám sức khỏe định kỳ", **payload},
        "computed": {},
        "attachments": [],
        "submittedAt": "2026-10-19T02:00:00Z",
        "createdAt": "2026-10-19T01:55:00Z",
        "updatedAt": "2026-10-19T02:00:00Z",
    }


def row(store: MockStore, emp: str, day: str, start_utc: str, end_utc: str) -> None:
    store.schedules.append(
        {"id": f"sch-{len(store.schedules)}", "employeeId": emp, "date": f"{day}T00:00:00.000Z",
         "shiftStart": f"{start_utc}", "shiftEnd": f"{end_utc}"}
    )


def with_team(store: MockStore, day: str, *emps: str) -> None:
    for emp in emps:
        store.add_employee(default_employee(emp) | {"fullName": f"Dong Nghiep {emp}", "email": f"{emp}@example.com"})
        row(store, emp, day, f"{day}T01:30:00.000Z", f"{day}T10:30:00.000Z")


async def context(api: ApiClient, request_id: str = "s1"):
    return await gather_shift_context(api, await get_request(api, request_id), TODAY)


def test_payload_accepts_web_fields() -> None:
    web = ShiftChangePayload.model_validate({"shiftDate": FRI, "targetShiftId": "tpl-afternoon", "reason": "x"})
    assert (web.shift_date, web.new_shift_template_id) == (date(2026, 10, 23), "tpl-afternoon")
    with pytest.raises(ValidationError):
        ShiftChangePayload.model_validate({"newShiftTemplateId": "tpl-afternoon", "reason": "x"})


async def test_clean_change_has_no_limit_findings(api: ApiClient, store: MockStore) -> None:
    store.add_request(shift_request("s1", {"shiftDate": FRI, "newShiftTemplateId": "tpl-afternoon"}))
    with_team(store, FRI, "emp-201", "emp-202")
    ctx = await context(api)
    assert (f"{ctx.old_window().start:%H:%M}", f"{ctx.new_window().start:%H:%M}") == ("08:30", "14:00")
    assert check_limits(ctx, SETTINGS) == []


async def test_schedule_id_lookup_and_missing_id(api: ApiClient, store: MockStore) -> None:
    row(store, "emp-001", THU, f"{THU}T01:30:00.000Z", f"{THU}T10:30:00.000Z")  # sch-0
    store.add_request(shift_request("s1", {"scheduleId": "sch-0", "newShiftTemplateId": "tpl-morning"}))
    store.add_request(shift_request("s2", {"scheduleId": "nope", "newShiftTemplateId": "tpl-morning"}))
    found = await context(api, "s1")
    assert found.current and found.base_date == date(2026, 10, 22)
    assert "Không tìm thấy ca hiện tại cần đổi" in check_limits(await context(api, "s2"), SETTINGS)


async def test_night_shift_ends_next_day_and_checks_rest_after(api: ApiClient, store: MockStore) -> None:
    store.add_request(shift_request("s1", {"shiftDate": THU, "newShiftTemplateId": "tpl-night"}))
    with_team(store, THU, "emp-201", "emp-202")
    ctx = await context(api)
    new = ctx.new_window()
    assert (f"{new.start:%d %H:%M}", f"{new.end:%d %H:%M}") == ("22 22:00", "23 06:00")
    assert any("Chỉ nghỉ 2.5 giờ" in r for r in check_limits(ctx, SETTINGS))  # Friday shift starts 08:30


async def test_moving_to_another_day_frees_the_old_day(api: ApiClient, store: MockStore) -> None:
    # Thursday's shift moves to Friday afternoon: Thursday no longer counts as a neighbour.
    store.add_request(shift_request("s1", {"shiftDate": THU, "newDate": FRI, "newShiftTemplateId": "tpl-morning"}))
    row(store, "emp-001", THU, f"{THU}T07:00:00.000Z", f"{THU}T15:00:00.000Z")  # 14:00-22:00 Thursday
    with_team(store, THU, "emp-201", "emp-202")
    ctx = await context(api)
    assert ctx.neighbour(date(2026, 10, 22)) is None
    assert not any("Chỉ nghỉ" in r for r in check_limits(ctx, SETTINGS))


async def test_department_rows_of_another_department_are_not_trusted(api: ApiClient, monkeypatch) -> None:
    # Like apps/api today: departmentId is ignored and the caller's own rows come back.
    async def caller_rows(path: str, params: dict | None = None) -> list[dict]:
        return [{"id": "x", "employeeId": "ai", "date": f"{FRI}T00:00:00.000Z", "shiftStart": f"{FRI}T01:30:00Z",
                 "shiftEnd": f"{FRI}T10:30:00Z", "employee": {"department": {"id": "dep-hr"}}}]

    monkeypatch.setattr(api, "get", caller_rows)
    assert await get_department_schedules(api, "dep-eng", date(2026, 10, 23), date(2026, 10, 23)) is None


async def test_prompt_never_names_colleagues(api: ApiClient, store: MockStore) -> None:
    store.add_request(shift_request("s1", {"shiftDate": FRI, "newShiftTemplateId": "tpl-afternoon", "reason": "Gọi 0912345678"}))
    with_team(store, FRI, "emp-201", "emp-202")
    built = build_shift_prompt(await context(api), SETTINGS)
    assert built.prompt_version == "shift_decision@1"
    assert "## Colleagues left on the current shift (null = not available)\n2" in built.user
    assert '"template": "Ca chiều"' in built.user and "[PHONE]" in built.user
    for secret in ("Dong Nghiep", "emp-201@example.com", default_employee()["fullName"], "0912345678"):
        assert secret not in built.user


async def test_new_shift_overlapping_previous_night_shift_is_flagged(api: ApiClient, store: MockStore) -> None:
    store.shift_templates.append({"id": "tpl-early", "name": "Ca sớm", "startTime": "05:00", "endTime": "13:00"})
    row(store, "emp-001", THU, f"{THU}T15:00:00.000Z", f"{THU}T23:00:00.000Z")  # Thu 22:00 -> Fri 06:00 (VN)
    store.add_request(shift_request("s1", {"shiftDate": FRI, "newShiftTemplateId": "tpl-early"}))
    with_team(store, FRI, "emp-201", "emp-202")
    reasons = check_limits(await context(api), SETTINGS)
    assert any("Ca mới chồng lên ca ngày 22/10 (22:00–06:00)" in r for r in reasons), reasons


async def test_back_to_back_shift_on_the_same_new_day(api: ApiClient, store: MockStore) -> None:
    row(store, "emp-001", FRI, f"{THU}T23:00:00.000Z", f"{FRI}T07:00:00.000Z")  # Fri 06:00-14:00 already assigned
    store.add_request(shift_request("s1", {"shiftDate": THU, "newDate": FRI, "newShiftTemplateId": "tpl-afternoon"}))
    with_team(store, THU, "emp-201", "emp-202")
    reasons = check_limits(await context(api), SETTINGS)
    assert any("Chỉ nghỉ 0 giờ với ca khác cùng ngày (06:00–14:00)" in r for r in reasons), reasons
    assert any("Tổng giờ làm trong ngày 16 giờ" in r for r in reasons)


async def test_every_other_shift_on_the_new_day_is_checked(api: ApiClient, store: MockStore) -> None:
    row(store, "emp-001", FRI, f"{THU}T22:00:00.000Z", f"{FRI}T01:00:00.000Z")  # Fri 05:00-08:00
    row(store, "emp-001", FRI, f"{FRI}T14:00:00.000Z", f"{FRI}T16:00:00.000Z")  # Fri 21:00-23:00
    store.add_request(shift_request("s1", {"shiftDate": THU, "newDate": FRI, "newShiftTemplateId": "tpl-afternoon"}))
    with_team(store, THU, "emp-201", "emp-202")
    reasons = check_limits(await context(api), SETTINGS)
    assert "Ca mới trùng với ca khác đã phân ngày 23/10" in reasons  # The second one (21:00) overlaps 14:00-22:00


async def test_every_shift_on_a_neighbouring_day_is_checked(api: ApiClient, store: MockStore) -> None:
    # Saturday has two rows; the second (05:00) leaves only 7h after the new Friday night end (22:00).
    sat = "2026-10-24"
    row(store, "emp-001", sat, f"{sat}T07:00:00.000Z", f"{sat}T10:00:00.000Z")  # Sat 14:00-17:00: fine
    row(store, "emp-001", sat, f"{FRI}T22:00:00.000Z", f"{sat}T01:00:00.000Z")  # Sat 05:00-08:00: too close
    store.add_request(shift_request("s1", {"shiftDate": FRI, "newShiftTemplateId": "tpl-afternoon"}))
    with_team(store, FRI, "emp-201", "emp-202")
    reasons = check_limits(await context(api), SETTINGS)
    assert any("Chỉ nghỉ 7 giờ giữa hai ca" in r for r in reasons), reasons
