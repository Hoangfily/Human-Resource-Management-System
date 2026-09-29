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

## Request conventions

- Authenticated endpoints use `Authorization: Bearer <access-token>`.
- Request identifiers are opaque strings; timestamps are ISO 8601 UTC.
- Paginated lists use `items`, `nextCursor`; mutation endpoints must be idempotent where retries are possible.
- The API validates permissions and policy on every write, including writes initiated by an AI tool.
- This document is a starting contract. Confirm payload schemas and status transitions before parallel implementation.
