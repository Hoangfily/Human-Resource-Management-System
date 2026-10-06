# 01 - API contract

Base path: `/api/v1`. JSON requests and responses use UTF-8. Error responses use `{ "code", "message", "details?", "requestId" }`.

Business rules and status transitions are defined in `05-business-spec.md`; policy values in `03-policy.md`.

## Endpoints

| Method | Path | Caller | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | Any | Service health (currently at root `/health` in scaffold) |
| GET | `/employees/me` | User | Current employee profile |
| GET | `/leave/balance` | User, AI | Leave balance (`?employeeId=` for manager/HR/AI) |
| GET | `/schedules` | User, AI | Schedule entries visible to caller (`?employeeId=&departmentId=&from=&to=`) |
| GET | `/requests` | User, AI | List requests visible to caller (`?status=&type=&employeeId=&cursor=`) |
| POST | `/requests` | User, AI | Create a draft request |
| GET | `/requests/:id` | User, AI | Request details, status, approvals, AI decision |
| POST | `/requests/:id/check` | User, AI | Run validation + hard rules without changing state |
| POST | `/requests/:id/submit` | User, AI | DRAFT → PENDING (AI only after user confirmation) |
| POST | `/requests/:id/cancel` | User | Cancel (see allowed transitions) |
| POST | `/requests/:id/escalate` | User, AI | Move to ESCALATED with reason |
| POST | `/requests/:id/ai-decision` | AI (service token) | AI approves/rejects a PENDING request |
| POST | `/requests/:id/decision` | Manager, HR | Human decision on PENDING/ESCALATED, or override of an AI/SYSTEM decision |
| POST | `/requests/:id/return` | Manager, HR | ESCALATED → DRAFT to ask for more information |
| GET | `/policies` | User, AI | Active `CompanyPolicy` entries with `version` |
| GET | `/autonomy-config` | AI, HR, Admin | Autonomy level per request type |
| PUT | `/autonomy-config/:type` | HR, Admin | Change autonomy level |
| POST | `/agent/chat` | User | Proxy a chat turn to the AI service |

## Payload Schemas (JSON Mẫu)

Dưới đây là cấu trúc dữ liệu JSON chính xác mà Frontend/AI gửi lên (Request) và Backend trả về (Response).

### 1. GET `/employees/me`
Trả về thông tin của nhân viên đang đăng nhập.
**Response (200 OK):**
```json
{
  "id": "uuid",
  "email": "employee@company.com",
  "fullName": "Nguyen Van A",
  "role": "EMPLOYEE",
  "status": "ACTIVE",
  "departmentId": "uuid",
  "positionId": "uuid",
  "managerId": "uuid"
}
```

### 2. GET `/leave/balance`
Lấy số dư quỹ phép. `availableDays = totalDays - usedDays - pendingDays`.
**Response (200 OK):**
```json
{
  "balances": [
    {
      "leaveTypeId": "uuid",
      "leaveTypeCode": "ANNUAL",
      "year": 2026,
      "totalDays": 12,
      "usedDays": 2,
      "pendingDays": 1,
      "availableDays": 9
    }
  ]
}
```

### 3. POST `/requests`
Tạo đơn mới ở trạng thái DRAFT. `employeeId` bỏ trống = chính người gọi; manager tạo thay cấp dưới thì truyền `employeeId`.
**Request Body:**
```json
{
  "type": "LEAVE",
  "employeeId": "uuid (optional)",
  "idempotencyKey": "unique-string-to-prevent-duplicate",
  "attachments": [],
  "payload": {
    "leaveTypeId": "uuid-of-annual-leave",
    "startDate": "2026-10-20",
    "endDate": "2026-10-21",
    "reason": "Nghỉ đi du lịch"
  }
}
```
**Response (201 Created):**
```json
{
  "id": "request-uuid",
  "type": "LEAVE",
  "status": "DRAFT",
  "computed": { "daysRequested": 2 },
  "createdAt": "2026-10-06T10:00:00Z"
}
```

Payload theo từng `type` (chi tiết và quy tắc ở `05-business-spec.md`):

| type | payload |
| --- | --- |
| `LEAVE` | `{ leaveTypeId, startDate, endDate, halfDay?, reason }` |
| `OVERTIME` | `{ date, startTime, endTime, reason }` |
| `ATTENDANCE_EXPLANATION` | `{ date, issue, attendanceEventId?, requestedTime?, explanation }` |
| `SHIFT_CHANGE` | `{ scheduleId, newDate, newShiftTemplateId, swapWithEmployeeId?, reason }` |

Field ngày dùng `YYYY-MM-DD`, giờ dùng `HH:mm`, hiểu theo `COMPANY.TIMEZONE`. Client **không** gửi `daysRequested`.

### 4. POST `/requests/:id/check` và kết quả submit
Trả về kết quả validation và luật cứng. `/submit` trả cùng cấu trúc kèm `status` mới.
**Response (200 OK):**
```json
{
  "valid": true,
  "missingFields": [],
  "violations": [
    { "rule": "LEAVE.NOTICE_DAYS", "outcome": "ESCALATE", "message": "Báo trước 1 ngày, yêu cầu 3 ngày làm việc" }
  ],
  "status": "ESCALATED",
  "policyVersion": "2026.10-draft"
}
```
`outcome` ∈ `INVALID` (giữ DRAFT) | `REJECT` | `ESCALATE`.

### 5. POST `/requests/:id/ai-decision`
Chỉ AI service gọi (service token). API kiểm tra lại luật cứng, `AutonomyConfig`, `riskLevel` và `confidence` trước khi áp dụng.
**Request Body:**
```json
{
  "decision": "APPROVED",
  "reason": "Đủ quỹ phép, báo trước đúng hạn, lý do hợp lý",
  "riskLevel": "LOW",
  "confidence": 0.93,
  "policyRefs": ["LEAVE.NOTICE_DAYS", "LEAVE.ANNUAL_DAYS_PER_YEAR"],
  "traceId": "agent-trace-uuid",
  "idempotencyKey": "unique-string"
}
```
**Response (200 OK):**
```json
{
  "id": "request-uuid",
  "status": "APPROVED",
  "applied": true,
  "decidedBy": "AI"
}
```
Không đủ điều kiện → `"status": "ESCALATED", "applied": false, "escalationReason": "..."`.

### 6. POST `/requests/:id/decision`
Manager/HR duyệt hoặc từ chối đơn PENDING/ESCALATED, hoặc ghi đè quyết định của AI/SYSTEM trong `APPROVAL.OVERRIDE_WINDOW_DAYS`.
**Request Body:**
```json
{
  "status": "APPROVED",
  "reason": "Đồng ý cho nghỉ"
}
```
*(`status` chỉ nhận `APPROVED` hoặc `REJECTED`; `reason` bắt buộc khi REJECTED hoặc khi ghi đè.)*

### 7. POST `/requests/:id/escalate`
**Request Body:**
```json
{
  "reason": "Lý do nghỉ không khớp với giấy tờ đính kèm",
  "riskLevel": "HIGH"
}
```

### 8. GET `/requests/:id`
**Response (200 OK):**
```json
{
  "id": "request-uuid",
  "type": "LEAVE",
  "status": "APPROVED",
  "employeeId": "uuid",
  "createdById": "uuid",
  "createdByType": "AI",
  "payload": { "leaveTypeId": "uuid", "startDate": "2026-10-20", "endDate": "2026-10-21", "reason": "..." },
  "computed": { "daysRequested": 2 },
  "attachments": [],
  "riskLevel": "LOW",
  "approvals": [
    { "deciderType": "AI", "approverId": null, "status": "APPROVED", "reason": "...", "confidence": 0.93, "decidedAt": "2026-10-06T10:01:00Z" }
  ],
  "createdAt": "2026-10-06T10:00:00Z",
  "updatedAt": "2026-10-06T10:01:00Z"
}
```

## Error codes

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | Missing/invalid fields (`details.missingFields`, `details.violations`) |
| 403 | `FORBIDDEN` | Caller lacks permission, self-approval, AI deciding a forbidden case |
| 404 | `NOT_FOUND` | |
| 409 | `INVALID_TRANSITION` | Status transition not allowed |
| 409 | `DUPLICATE_REQUEST` | Overlaps an existing request |
| 409 | `IDEMPOTENCY_CONFLICT` | Same key, different body |

## Request conventions

- Authenticated endpoints use `Authorization: Bearer <access-token>`. The AI service uses a dedicated service token and acts **on behalf of** a user via the `X-On-Behalf-Of: <employeeId>` header, except for `/ai-decision`.
- Request identifiers are opaque strings; timestamps are ISO 8601 UTC.
- Paginated lists use `items`, `nextCursor`; mutation endpoints accept `idempotencyKey` and must be idempotent.
- The API validates permissions, hard rules and autonomy limits on every write, including writes initiated by the AI.
- Every write carries an `X-Correlation-Id` header (generated if absent) that is stored in the audit log.
