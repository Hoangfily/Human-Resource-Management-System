export interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  totalDays: number;
  usedDays: number;
  pendingDays: number; // Reserved by PENDING/ESCALATED requests
  availableDays: number; // Computed field: totalDays - usedDays - pendingDays
}

export interface LeaveRequestPayload {
  leaveTypeId: string;
  startDate: string; // YYYY-MM-DD, company timezone
  endDate: string; // YYYY-MM-DD, company timezone
  halfDay?: 'AM' | 'PM'; // Only when startDate === endDate
  reason: string;
  // daysRequested is computed by the API, never sent by the client
}
