# 03 - HR policy

This file is the single source of truth for the values used by the API rule engine and AI retrieval. `05-business-spec.md` references the keys below; do not hard-code these numbers elsewhere.

> **Status: proposed values.** They follow common Vietnamese practice (Labor Code 2019) as a starting point and must be confirmed by HR before using real employee data. Every change bumps `POLICY_VERSION`.

`POLICY_VERSION`: `2026.10-draft`

## Approval principles

- Hard rules are enforced by the API and cannot be overridden by the agent.
- Within its configured autonomy level, the agent **may approve or reject low-risk requests on its own**. Everything else is escalated to a human.
- The agent may explain a rule only with a citation to this file or a `CompanyPolicy` entry; it must not invent policy.
- Record `POLICY_VERSION` and rule outcomes in the audit trail for every decision.

## Company

| Key | Value | Notes |
| --- | --- | --- |
| `COMPANY.TIMEZONE` | `Asia/Ho_Chi_Minh` | Used to interpret date-only fields |
| `COMPANY.WORKING_DAYS` | Mon–Fri | |
| `COMPANY.HOLIDAYS` | Maintained by HR per year | Excluded from leave day count |

## Leave

| Key | Value | Notes |
| --- | --- | --- |
| `LEAVE.ANNUAL_DAYS_PER_YEAR` | 12 | Labor Code art. 113 baseline |
| `LEAVE.PERSONAL_DAYS` | Own marriage 3, child's marriage 1, death of parent/spouse/child 3 | Labor Code art. 115 |
| `LEAVE.NOTICE_DAYS` | 3 working days if ≤ 2 days; 7 working days if > 2 days | Not applied to `SICK` |
| `LEAVE.SICK_BACKDATE_DAYS` | 2 working days | Sick leave may be submitted after the fact within this window |
| `LEAVE.SICK_CERT_REQUIRED_AFTER_DAYS` | 2 | Longer sick leave needs a medical certificate attachment |
| `LEAVE.UNPAID_MAX_AUTO_DAYS` | 3 | Longer unpaid leave is escalated |
| `LEAVE.CARRY_OVER_DAYS` | 0 | To confirm |

## Overtime

| Key | Value | Notes |
| --- | --- | --- |
| `OT.MAX_TOTAL_HOURS_PER_DAY` | 12 | Normal hours + overtime |
| `OT.MAX_HOURS_PER_MONTH` | 40 | Labor Code art. 107 |
| `OT.MAX_HOURS_PER_YEAR` | 200 | Labor Code art. 107 (300 for some sectors) |

## Attendance

| Key | Value | Notes |
| --- | --- | --- |
| `ATTENDANCE.EXPLAIN_WITHIN_DAYS` | 3 working days | |
| `ATTENDANCE.SHIFT_TOLERANCE_MINUTES` | 60 | Requested time must be within the shift ± this |
| `ATTENDANCE.MAJOR_DEVIATION_MINUTES` | 120 | |
| `ATTENDANCE.EVIDENCE_REQUIRED_AFTER_MINUTES` | 30 | |
| `ATTENDANCE.MAX_AUTO_PER_MONTH` | 3 | More explanations in a month are escalated |
| Location data | Stored only at clock-in/out; never sent to the AI | Privacy |

## Shift change

| Key | Value | Notes |
| --- | --- | --- |
| `SHIFT.NOTICE_HOURS` | 48 | |
| `SHIFT.MIN_REST_HOURS` | 12 | Rest between two shifts |
| `SHIFT.MIN_STAFF_PER_SHIFT` | Configured per department/shift template | |

## Human approval

| Key | Value | Notes |
| --- | --- | --- |
| `APPROVAL.MANAGER_SLA_HOURS` | 48 | Then routed to HR |
| `APPROVAL.HR_SECOND_STEP_TYPES` | Escalated `OVERTIME`, escalated `ATTENDANCE_EXPLANATION` | Payroll impact |
| `APPROVAL.OVERRIDE_WINDOW_DAYS` | 7 | Humans may override AI/SYSTEM decisions within this window |

## AI autonomy

| Key | Value | Notes |
| --- | --- | --- |
| `AI.AUTONOMY.LEAVE` | `AUTO_DECIDE_LOW_RISK` | |
| `AI.AUTONOMY.OVERTIME` | `AUTO_APPROVE_LOW_RISK` | |
| `AI.AUTONOMY.ATTENDANCE_EXPLANATION` | `AUTO_APPROVE_LOW_RISK` | |
| `AI.AUTONOMY.SHIFT_CHANGE` | `AUTO_DECIDE_LOW_RISK` | |
| `AI.MIN_CONFIDENCE` | 0.85 | |
| `AI.MAX_AUTO_LEAVE_DAYS` | 3 | Longer leave is escalated |
| `AI.MAX_AUTO_PAYROLL_IMPACT_HOURS` | 4 | Per request |

Autonomy levels are stored in the `AutonomyConfig` table so HR/ADMIN can change them at runtime; the values above are the seeded defaults.
