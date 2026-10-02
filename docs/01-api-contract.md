# 01 - API contract

Base path: `/api/v1`. JSON requests and responses use UTF-8. Error responses use `{ "code", "message", "details?", "requestId" }`.

## Initial endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Service health (currently at root `/health` in scaffold) |
| GET | `/employees/me` | Current employee profile |
| GET | `/leave/balance` | Current employee leave balance |
| POST | `/requests` | Create a request |
| GET | `/requests/:id` | Request details and status |
| POST | `/requests/:id/submit` | Submit a draft for approval |
| POST | `/requests/:id/decision` | Approve or reject with reason |
| POST | `/agent/chat` | Proxy a chat turn to the AI service |

## Payload Schemas (JSON Mẫu)

Dưới đây là cấu trúc dữ liệu JSON chính xác mà Frontend sẽ gửi lên (Request) và Backend sẽ trả về (Response) cho các Endpoint quan trọng.

### 1. GET `/employees/me`
Trả về thông tin của nhân viên đang đăng nhập.
**Response (200 OK):**
```json
{
  "id": "uuid",
  "email": "employee@company.com",
  "fullName": "Nguyen Van A",
  "role": "EMPLOYEE",
  "departmentId": "uuid",
  "positionId": "uuid",
  "managerId": "uuid"
}
```

### 2. GET `/leave/balance`
Lấy số dư quỹ phép của nhân viên hiện tại (để biết còn bao nhiêu ngày nghỉ).
**Response (200 OK):**
```json
{
  "balances": [
    {
      "leaveTypeId": "uuid",
      "leaveTypeCode": "ANNUAL",
      "totalDays": 12,
      "usedDays": 2,
      "availableDays": 10
    }
  ]
}
```

### 3. POST `/requests`
Tạo một yêu cầu mới (ví dụ: Tạo đơn xin nghỉ phép).
**Request Body:**
```json
{
  "type": "LEAVE",
  "idempotencyKey": "unique-string-to-prevent-duplicate",
  "payload": {
    "startDate": "2024-05-10T00:00:00Z",
    "endDate": "2024-05-12T00:00:00Z",
    "leaveTypeId": "uuid-of-annual-leave",
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
  "createdAt": "2024-05-01T10:00:00Z"
}
```

### 4. POST `/requests/:id/decision`
Dành cho Quản lý / HR gọi để Duyệt hoặc Từ chối đơn.
**Request Body:**
```json
{
  "status": "APPROVED", 
  "reason": "Đồng ý cho nghỉ"
}
```
*(Lưu ý: trường `status` ở đây chỉ được nhận `APPROVED` hoặc `REJECTED`)*

## Request conventions

- Authenticated endpoints use `Authorization: Bearer <access-token>`.
- Request identifiers are opaque strings; timestamps are ISO 8601 UTC.
- Paginated lists use `items`, `nextCursor`; mutation endpoints must be idempotent where retries are possible.
- The API validates permissions and policy on every write, including writes initiated by an AI tool.
- This document is a starting contract. Confirm payload schemas and status transitions before parallel implementation.
