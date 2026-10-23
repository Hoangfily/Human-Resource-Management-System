"""Synthetic demo data. Policy values mirror docs/03-policy.md (POLICY_VERSION 2026.10-draft)."""

from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

MOCK_TOKEN = "dev-ai-service-token"
POLICY_VERSION = "2026.10-draft"

LEAVE_TYPES = {
    "lt-annual": "ANNUAL",
    "lt-sick": "SICK",
    "lt-unpaid": "UNPAID",
    "lt-personal": "PERSONAL",
}

_POLICIES = [
    ("COMPANY.TIMEZONE", "Múi giờ công ty", "Asia/Ho_Chi_Minh. Ngày làm việc: thứ 2 đến thứ 6."),
    ("LEAVE.ANNUAL_DAYS_PER_YEAR", "Phép năm", "Mỗi nhân viên có 12 ngày phép năm."),
    (
        "LEAVE.PERSONAL_DAYS",
        "Nghỉ việc riêng có lương",
        "Chỉ áp dụng cho: bản thân kết hôn 3 ngày, con kết hôn 1 ngày, "
        "cha mẹ/vợ/chồng/con mất 3 ngày. Lý do khác phải dùng ANNUAL hoặc UNPAID.",
    ),
    (
        "LEAVE.NOTICE_DAYS",
        "Báo trước khi nghỉ",
        "Nghỉ ≤ 2 ngày báo trước 3 ngày làm việc; > 2 ngày báo trước 7 ngày làm việc. Không áp dụng cho SICK.",
    ),
    ("LEAVE.SICK_BACKDATE_DAYS", "Nộp đơn nghỉ ốm sau", "Đơn SICK được nộp muộn tối đa 2 ngày làm việc."),
    (
        "LEAVE.SICK_CERT_REQUIRED_AFTER_DAYS",
        "Giấy khám bệnh",
        "Nghỉ ốm trên 2 ngày phải đính kèm giấy khám bệnh.",
    ),
    ("LEAVE.UNPAID_MAX_AUTO_DAYS", "Nghỉ không lương", "Nghỉ không lương trên 3 ngày phải được người duyệt."),
    ("AI.MIN_CONFIDENCE", "Ngưỡng tin cậy AI", "AI chỉ tự quyết khi confidence ≥ 0.85."),
    ("AI.MAX_AUTO_LEAVE_DAYS", "Giới hạn AI tự duyệt", "AI chỉ tự quyết đơn nghỉ tối đa 3 ngày."),
    ("AI.MAX_AUTO_PAYROLL_IMPACT_HOURS", "Giới hạn giờ AI tự duyệt", "AI chỉ tự quyết đơn làm thêm hoặc giải trình ảnh hưởng tối đa 4 giờ công."),
    ("ATTENDANCE.EXPLAIN_WITHIN_DAYS", "Hạn giải trình chấm công", "Phải giải trình trong vòng 3 ngày làm việc kể từ ngày phát sinh."),
    ("ATTENDANCE.SHIFT_TOLERANCE_MINUTES", "Giờ đề nghị so với ca", "Giờ đề nghị ghi nhận phải nằm trong ca ± 60 phút."),
    ("ATTENDANCE.MAJOR_DEVIATION_MINUTES", "Lệch giờ lớn", "Sửa giờ lệch quá 120 phút so với dữ liệu gốc phải được người duyệt."),
    ("ATTENDANCE.EVIDENCE_REQUIRED_AFTER_MINUTES", "Bằng chứng", "Lệch trên 30 phút phải có bằng chứng đính kèm."),
    ("ATTENDANCE.MAX_AUTO_PER_MONTH", "Số đơn giải trình mỗi tháng", "Quá 3 đơn giải trình trong tháng phải được người duyệt."),
    ("OT.MAX_TOTAL_HOURS_PER_DAY", "Giờ làm tối đa mỗi ngày", "Tổng giờ làm trong ngày (ca + làm thêm) không quá 12 giờ."),
    ("OT.MAX_HOURS_PER_MONTH", "Làm thêm tối đa mỗi tháng", "Không quá 40 giờ làm thêm mỗi tháng."),
    ("OT.MAX_HOURS_PER_YEAR", "Làm thêm tối đa mỗi năm", "Không quá 200 giờ làm thêm mỗi năm."),
]


def default_policies() -> dict[str, Any]:
    return {
        "version": POLICY_VERSION,
        "items": [{"key": k, "version": POLICY_VERSION, "title": t, "content": c} for k, t, c in _POLICIES],
    }


def default_autonomy() -> dict[str, dict[str, Any]]:
    levels = {
        "LEAVE": "AUTO_DECIDE_LOW_RISK",
        "OVERTIME": "AUTO_APPROVE_LOW_RISK",
        "ATTENDANCE_EXPLANATION": "AUTO_APPROVE_LOW_RISK",
        "SHIFT_CHANGE": "AUTO_DECIDE_LOW_RISK",
    }
    return {t: {"requestType": t, "level": lvl, "minConfidence": 0.85} for t, lvl in levels.items()}


def default_employee(employee_id: str = "emp-001") -> dict[str, Any]:
    # Contact fields are included on purpose: the AI side must drop them.
    return {
        "id": employee_id,
        "email": "nguyen.van.a@example.com",
        "fullName": "Nguyen Van A",
        "phone": "0901234567",
        "role": "EMPLOYEE",
        "status": "ACTIVE",
        "joinDate": "2023-03-01",
        "shiftTime": "08:30 - 17:30",
        "departmentId": "dep-eng",
        "managerId": "emp-100",
    }


def default_balances(year: int = 2026) -> list[dict[str, Any]]:
    rows = [("lt-annual", 12, 2, 0), ("lt-sick", 30, 1, 0), ("lt-unpaid", 30, 0, 0), ("lt-personal", 3, 0, 0)]
    return [
        {
            "leaveTypeId": lt,
            "leaveTypeCode": LEAVE_TYPES[lt],
            "year": year,
            "totalDays": total,
            "usedDays": used,
            "pendingDays": pending,
            "availableDays": total - used - pending,
        }
        for lt, total, used, pending in rows
    ]


@dataclass
class MockStore:
    token: str = MOCK_TOKEN
    employees: dict[str, dict[str, Any]] = field(default_factory=dict)
    requests: dict[str, dict[str, Any]] = field(default_factory=dict)
    balances: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    policies: dict[str, Any] = field(default_factory=default_policies)
    autonomy: dict[str, dict[str, Any]] = field(default_factory=default_autonomy)
    writes: list[dict[str, Any]] = field(default_factory=list)  # Every POST received, for assertions
    fail_next: list[int] = field(default_factory=list)  # Status codes to return for the next calls
    missing_paths: set[str] = field(default_factory=set)  # Path suffixes answered with 404, e.g. "/ai-decision"
    schedules: list[dict[str, Any]] = field(default_factory=list)  # Rows of GET /shifts/schedules
    attendance_events: list[dict[str, Any]] = field(default_factory=list)  # Rows of GET /attendance/events

    def add_employee(self, employee: dict[str, Any], balances: list[dict[str, Any]] | None = None) -> None:
        self.employees[employee["id"]] = deepcopy(employee)
        self.balances[employee["id"]] = deepcopy(balances if balances is not None else default_balances())

    def add_request(self, request: dict[str, Any]) -> None:
        self.requests[request["id"]] = deepcopy(request)


def demo_store() -> MockStore:
    """Data for running the mock API by hand: one employee with one PENDING leave request."""
    store = MockStore()
    store.add_employee(default_employee())
    store.add_request(
        {
            "id": "req-demo-1",
            "type": "LEAVE",
            "status": "PENDING",
            "employeeId": "emp-001",
            "createdById": "emp-001",
            "createdByType": "HUMAN",
            # Shape apps/api stores: web sends leaveType + daysCount, API adds leaveTypeId/leaveTypeName.
            "payload": {
                "leaveType": "ANNUAL",
                "leaveTypeId": "lt-annual",
                "leaveTypeName": "Nghỉ phép năm",
                "startDate": "2026-10-29",
                "endDate": "2026-10-30",
                "daysCount": 2,
                "reason": "Về quê dự đám cưới em họ",
            },
            "computed": {"daysRequested": 2},
            "attachments": [],
            "submittedAt": "2026-10-19T02:00:00Z",
            "createdAt": "2026-10-19T01:55:00Z",
            "updatedAt": "2026-10-19T02:00:00Z",
        }
    )
    return store
