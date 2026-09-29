# 04 - Database schema

The initial Prisma models in `apps/api/prisma/schema.prisma` are scaffolding only. Expand them after API and policy contracts are agreed.

## Planned domains

- Identity: employees, departments, positions, roles and refresh sessions.
- Requests: typed request payload, status history and idempotency keys.
- HR: leave types/balances, attendance events/explanations, shifts and schedules.
- Approvals: approver assignments, decisions, escalation and revocation.
- AI: agent traces, tool calls, policy references and autonomy configuration.
- Audit: append-only record of actor, action, entity, timestamp and correlation ID.

Store timestamps in UTC. Minimize personal data, define retention periods, and restrict access by role and organizational scope.
