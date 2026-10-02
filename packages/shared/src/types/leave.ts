export interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  totalDays: number;
  usedDays: number;
  availableDays: number; // Computed field: totalDays - usedDays
}

export interface LeaveRequestPayload {
  startDate: string; // ISO 8601 date
  endDate: string; // ISO 8601 date
  leaveTypeId: string;
  reason: string;
}
