import type { ActorType } from '../enums/actor-type';
import type { ApprovalStatus } from '../enums/approval-status';
import type { RequestStatus } from '../enums/request-status';
import { RequestType } from '../enums/request-type';
import type { RiskLevel } from '../enums/risk-level';
import type { LeaveRequestPayload } from './leave';

export interface OvertimeRequestPayload {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm, company timezone
  endTime: string; // HH:mm, company timezone
  reason: string;
}

export type AttendanceIssue =
  | 'MISSING_CLOCK_IN'
  | 'MISSING_CLOCK_OUT'
  | 'LATE'
  | 'EARLY_LEAVE'
  | 'WRONG_TIME';

export interface AttendanceExplanationPayload {
  date: string; // YYYY-MM-DD
  issue: AttendanceIssue;
  attendanceEventId?: string; // Required when issue = WRONG_TIME
  requestedTime?: string; // ISO 8601; required for MISSING_* and WRONG_TIME
  explanation: string;
}

export interface ShiftChangePayload {
  scheduleId: string;
  newDate: string; // YYYY-MM-DD
  newShiftTemplateId: string;
  swapWithEmployeeId?: string;
  reason: string;
}

export interface RequestPayloadMap {
  [RequestType.Leave]: LeaveRequestPayload;
  [RequestType.Overtime]: OvertimeRequestPayload;
  [RequestType.AttendanceExplanation]: AttendanceExplanationPayload;
  [RequestType.ShiftChange]: ShiftChangePayload;
}

export interface RequestSummary {
  id: string;
  type: RequestType;
  status: RequestStatus;
  createdAt: string;
}

export interface ApprovalSummary {
  deciderType: ActorType;
  approverId: string | null; // null for AI/SYSTEM
  status: ApprovalStatus;
  reason?: string;
  riskLevel?: RiskLevel;
  confidence?: number;
  decidedAt?: string;
}

/** Body of POST /requests/:id/ai-decision */
export interface AiDecisionInput {
  decision: RequestStatus.Approved | RequestStatus.Rejected;
  reason: string;
  riskLevel: RiskLevel;
  confidence: number; // 0..1
  policyRefs: string[]; // Keys from docs/03-policy.md
  traceId?: string;
  idempotencyKey: string;
}
