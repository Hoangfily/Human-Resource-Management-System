import { RequestStatus, RequestType } from '@hr-agent/shared';

export interface LeaveBalanceItem {
  leaveType: string;
  leaveTypeName: string;
  totalDays: number;
  usedDays: number;
  availableDays: number;
}

export interface LeaveBalanceResponse {
  employeeId: string;
  balances: LeaveBalanceItem[];
}

export interface LeaveRequestPayload {
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  attachments?: string[];
}

export interface AttendanceExplanationPayload {
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  explanationType: 'FORGOT_CHECK_IN' | 'LATE' | 'EARLY_LEAVE';
  reason: string;
  attachments?: string[];
}

export interface ShiftChangePayload {
  shiftDate: string;
  currentShiftId: string;
  targetShiftId: string;
  targetEmployeeId?: string;
  reason: string;
}

export type RequestPayload =
  | LeaveRequestPayload
  | AttendanceExplanationPayload
  | ShiftChangePayload
  | Record<string, unknown>;

export interface RequestItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  departmentName?: string;
  type: RequestType;
  status: RequestStatus;
  payload: RequestPayload;
  aiRiskScore?: number;
  aiPolicyFindings?: string[];
  approverId?: string;
  approverName?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRequestInput {
  type: RequestType;
  payload: RequestPayload;
  idempotencyKey?: string;
}
