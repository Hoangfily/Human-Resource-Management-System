# 00 - Scope and ownership

## Goal

Build an HR request management system in which an AI agent explains policy, prepares requests, and **automatically approves or rejects low-risk requests**. Requests that need human judgment are escalated to a manager or HR.

## Work split

- Web (2 people): screens, forms, mock API, accessibility and responsive behavior.
- API: authentication, HR domain rules, persistence, approval lifecycle and audit trail.
- AI: intent routing, policy retrieval, request evaluation and automatic decisions, tool calls through the API, guardrails and evaluation scenarios.

## Delivery sequence

1. Agree on `01-api-contract.md`, `02-agent-tools.md`, `03-policy.md` and `05-business-spec.md`.
2. Build UI and AI tools against mocks/contracts in parallel.
3. Implement API modules and shared enum/type definitions.
4. Integrate end-to-end, validate policies and run scenario evaluations.

## Boundaries

- The API is the source of truth for permissions, policy decisions, writes and audit logs.
- The AI service must not connect directly to PostgreSQL.
- The AI may approve or reject a request only within the autonomy level configured for its type, after the API's hard rules pass, and only for low-risk, high-confidence cases (see `05-business-spec.md` §7). The API re-checks every AI decision and escalates when the conditions are not met.
- Escalated requests are decided by humans only. Managers/HR can override AI decisions within the override window.
- Use synthetic employee data in development and tests.
