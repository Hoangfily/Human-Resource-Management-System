# 02 - Agent tools

All tools are implemented in `apps/ai` and call authenticated `apps/api` endpoints. Never give the AI service database credentials.

| Tool | Input | Output | Access |
| --- | --- | --- | --- |
| `get_employee` | `{ employee_id? }` | Employee profile allowed for caller | Read |
| `get_leave_balance` | `{ employee_id, as_of? }` | `{ balances: [{ leave_type, available }] }` | Read |
| `get_team_schedule` | `{ team_id, from, to }` | Schedule entries visible to caller | Read |
| `check_request` | `{ type, payload }` | Policy findings and missing fields | Read / validate |
| `create_request` | `{ type, payload, idempotency_key }` | Created draft summary | Write |
| `escalate_to_human` | `{ request_id, reason, risk_level }` | Escalation status | Write |

Write tools must validate authorization and policy in the API, include an idempotency key, and return a stable error code. There is intentionally no unrestricted AI `approve_request` tool in the initial scaffold.

## Tool Schemas (Định dạng Input cho AI)

Dưới đây là các định dạng tham số (arguments) chính xác mà AI cần truyền vào khi gọi các function/tool này. Nó phải khớp 100% với API Contract.

### 1. `get_leave_balance`
Tra cứu số dư nghỉ phép. AI dùng tool này khi user hỏi "Tôi còn bao nhiêu ngày phép?".
**Input JSON:**
```json
{
  "employee_id": "uuid-của-nhân-viên-cần-tra-cứu"
}
```

### 2. `create_request`
Thay mặt người dùng điền và nộp đơn. AI dùng tool này khi user ra lệnh "Tạo cho tôi đơn xin nghỉ ốm ngày mai".
**Input JSON:**
```json
{
  "type": "LEAVE",
  "idempotency_key": "unique-id-do-AI-tự-sinh-để-tránh-trùng-lặp",
  "payload": {
    "startDate": "2024-05-10T00:00:00Z",
    "endDate": "2024-05-12T00:00:00Z",
    "leaveTypeId": "uuid-loại-nghỉ-phép",
    "reason": "Lý do nghỉ"
  }
}
```

### 3. `escalate_to_human`
Báo cáo lên người thật. AI gọi tool này khi phát hiện yêu cầu vi phạm chính sách hoặc rủi ro cao (ví dụ: xin nghỉ phép nhiều hơn số ngày hiện có).
**Input JSON:**
```json
{
  "request_id": "uuid-của-đơn-vừa-tạo",
  "reason": "Số ngày phép không đủ, cần quản lý duyệt ngoại lệ",
  "risk_level": "HIGH"
}
```
