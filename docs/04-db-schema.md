# 04 - Database schema

The Prisma models live in `apps/api/prisma/schema.prisma`. They follow `05-business-spec.md`; update both together.

## Domains

- Identity: employees, departments, positions, roles and refresh sessions.
- Requests: typed request payload, creator (human or AI), status history and idempotency keys.
- HR: leave types/balances (with `pendingDays` reservation), attendance events, shift templates and schedules.
- Approvals: decisions by `HUMAN`, `AI` or `SYSTEM` (`deciderType`), AI risk level/confidence, revocation when a human overrides an AI decision.
- AI: agent traces (tool calls, decision, risk, confidence, policy references, model), versioned company policies and `AutonomyConfig` per request type.
- Audit: append-only record of actor type, actor, action, entity, before/after payload, policy version, timestamp and correlation ID.

## Notes

- AI and SYSTEM decisions have `Approval.approverId = null` and `deciderType` set accordingly.
- `RequestStatusHistory` has one row per status change; the API writes it in the same transaction as the status update.
- `LeaveBalance.availableDays` is computed (`totalDays - usedDays - pendingDays`), not stored.

Store timestamps in UTC. Minimize personal data, define retention periods, and restrict access by role and organizational scope.
