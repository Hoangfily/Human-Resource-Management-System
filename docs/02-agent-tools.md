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
