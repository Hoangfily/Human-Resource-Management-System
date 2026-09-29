# 00 - Scope and ownership

## Goal

Build an HR request management system with an AI assistant that can explain policy, prepare requests, and support human approval.

## Work split

- Web (2 people): screens, forms, mock API, accessibility and responsive behavior.
- API: authentication, HR domain rules, persistence, approval lifecycle and audit trail.
- AI: intent routing, policy retrieval, tool calls through the API, guardrails and evaluation scenarios.

## Delivery sequence

1. Agree on `01-api-contract.md` and `02-agent-tools.md`.
2. Build UI and AI tools against mocks/contracts in parallel.
3. Implement API modules and shared enum/type definitions.
4. Integrate end-to-end, validate policies and run scenario evaluations.

## Boundaries

- The API is the source of truth for permissions, policy decisions, writes and audit logs.
- The AI service must not connect directly to PostgreSQL.
- AI suggestions do not replace required human approvals.
- Use synthetic employee data in development and tests.
