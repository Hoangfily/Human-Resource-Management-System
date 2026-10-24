# 01 - API contract

Base path: `/api/v1`. JSON requests and responses use UTF-8. Error responses use `{ "code", "message", "details?", "requestId" }`.

Business rules and status transitions are defined in `05-business-spec.md`; policy values in `03-policy.md`.

## Endpoints

| Method | Path | Caller | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | Any | Service health (currently at root `/health` in scaffold) |
| GET | `/employees/me` | User | Current employee profile |
| GET | `/employees/:id` | Manager, HR, AI | Employee profile (AI receives no contact details) |
| GET | `/leave/balance` | User, AI | Leave balance (`?employeeId=` for manager/HR/AI) |
| GET | `/schedules` | User, AI | Schedule entries visible to caller (`?employeeId=&departmentId=&from=&to=`) |
| GET | `/requests` | User, AI | Requests visible to caller, newest first (`?status=&type=&employeeId=&limit=&offset=`). Returns a plain array |
| POST | `/requests` | User, AI | Create a draft request |
| GET | `/requests/:id` | User, AI | Request details, status, approvals, AI decision |
| POST | `/requests/:id/check` | User, AI | Run validation + hard rules without changing state |
| POST | `/requests/:id/submit` | User, AI | DRAFT → PENDING (AI only after user confirmation) |
| POST | `/requests/:id/cancel` | User | Cancel (see allowed transitions) |
| POST | `/requests/:id/escalate` | User, AI | Move to ESCALATED with reason |
| POST | `/requests/:id/ai-decision` | AI (service token) | AI approves/rejects a PENDING request. **Not built in apps/api yet** |
| POST | `/requests/:id/decision` | Manager, HR | Human decision on PENDING/ESCALATED, or override of an AI/SYSTEM decision |
| POST | `/requests/:id/return` | Manager, HR | ESCALATED → DRAFT to ask for more information |
| GET | `/shifts/templates` | User, AI | Shift templates. Array of `{ id, name, startTime, endTime }` (`HH:mm`; end before start = night shift) |
| GET | `/shifts/schedules` | User, AI | Assigned shifts (`?employeeId=&from=&to=`). Array of `{ id, employeeId, date, shiftStart, shiftEnd, employee: { department: { id } } }`. The AI also calls it with `?departmentId=&from=&to=` to count colleagues left on a shift: **not built in apps/api yet** (it ignores departmentId and returns the caller's rows) |
| GET | `/attendance/events` | HR, AI | Raw clock events of one employee (`?employeeId=&from=&to=`). Array of `{ id, employeeId, type, timestamp }` (ISO UTC). **Not built in apps/api yet**: `/attendance/history` only returns the caller's own days, pre-formatted, so the AI cannot use it |
| GET | `/policy` | User, AI | Active `CompanyPolicy` entries (`?search=&activeOnly=`). Returns an array of `{ key, version, title, content, isActive }` |
| GET | `/policy/:key` | User, AI | One policy entry |
| POST | `/policy` | HR, Admin | Create or update a policy entry |
| GET | `/agent/autonomy-config` | AI, HR, Admin | Array of `{ requestType, level, minConfidence }`, one per request type |
| PUT | `/agent/autonomy-config/:requestType` | HR, Admin | Change autonomy level |
| GET | `/agent/traces` | HR, Admin | Latest AgentTrace rows (`?limit=`) |
| POST | `/agent/chat` | User | Forwards the turn to the AI service `POST /api/chat`; answers from a built-in fallback while the AI service is down |

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
  "idempotencyKey": "ai-eval:<requestId>:<updatedAt>",
  "trace": {
    "mode": "DECISION",
    "model": "gemini-3.5-flash",
    "promptVersion": "leave_decision@2",
    "policyVersion": "2026.10-draft",
    "toolCalls": [{ "method": "GET", "path": "/requests/<id>", "status": 200, "ms": 12 }, { "tool": "llm.assess", "model": "gemini-3.5-flash", "ms": 4100 }],
    "policyRefs": ["LEAVE.NOTICE_DAYS"],
    "proposedDecision": "APPROVED",
    "riskLevel": "LOW",
    "confidence": 0.93,
    "rationale": "Nhận định nội bộ cho người duyệt",
    "guardReasons": [],
    "latencyMs": 4100
  }
}
```
`reason` là câu gửi cho nhân viên. API lưu `trace` vào `AgentTrace` (AI service không có quyền ghi DB). `idempotencyKey` giữ nguyên với cùng một phiên bản đơn, nên gọi lại không tạo quyết định thứ hai.
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
  "riskLevel": "HIGH",
  "idempotencyKey": "ai-eval:<requestId>:<updatedAt>",
  "trace": { "...": "giống /ai-decision, có thể bỏ trống khi người dùng tự escalate" }
}
```
Khi AI escalate, `reason` gồm các lý do guardrail cộng nhận định của AI, để người duyệt đọc. `idempotencyKey` và `trace` chỉ AI gửi.

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

## AI service endpoints (apps/ai, called by the API)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Service health |
| POST | `/evaluate` | Evaluate one PENDING request: the AI then calls `/ai-decision` or `/escalate` itself |

`POST /evaluate` requires header `X-Service-Token: <AI_INBOUND_TOKEN>` (401 if wrong, 503 if the AI service has no token configured). Send `X-Correlation-Id` to reuse the same id in the AI's calls back to the API.

**Request Body:** `{ "requestId": "uuid" }`

**Response (200 OK):**
```json
{
  "requestId": "uuid",
  "action": "APPROVE",
  "status": "APPROVED",
  "applied": true,
  "reasons": [],
  "assessment": { "decision": "APPROVED", "riskLevel": "LOW", "confidence": 0.95, "policyRefs": ["LEAVE.NOTICE_DAYS"], "rationale": "...", "employeeMessage": "..." }
}
```
`action` ∈ `APPROVE` | `REJECT` | `ESCALATE` | `SKIP` (request was not PENDING; nothing written). Any AI failure (LLM timeout, missing data) ends in `ESCALATE`, never a guess. 404 when the request does not exist, 502 when the API cannot be reached.

The call can take up to ~40 s (LLM + fallback model). Call it **asynchronously** after the status change; the result is already written through `/ai-decision` or `/escalate`.

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

- Authenticated endpoints use `Authorization: Bearer <access-token>`. The AI service uses a dedicated service token and acts **on behalf of** a user via the `X-On-Behalf-Of: <employeeId>` header, except for `/ai-decision`. **Not built in apps/api yet:** every route currently accepts only a user JWT.
- Request identifiers are opaque strings; timestamps are ISO 8601 UTC.
- List endpoints return plain arrays with `limit`/`offset`; mutation endpoints accept `idempotencyKey` and must be idempotent.
- LEAVE payloads from the web carry `leaveType` (code) and `daysCount`; the API adds `leaveTypeId`. `computed.daysRequested` is the value that counts, never the client's `daysCount`.
- The API validates permissions, hard rules and autonomy limits on every write, including writes initiated by the AI.
- Every write carries an `X-Correlation-Id` header (generated if absent) that is stored in the audit log.
