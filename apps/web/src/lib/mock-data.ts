import { UserRole, RequestStatus, RequestType } from '@hr-agent/shared';
import { User, RequestItem, LeaveBalanceResponse } from '../types';

export const MOCK_USERS: Record<string, User> = {
  employee: {
    id: 'emp-001',
    email: 'an.nguyen@company.com',
    fullName: 'Nguyễn Văn An',
    role: UserRole.Employee,
    departmentId: 'dept-tech',
    departmentName: 'Phòng Công nghệ Thông tin',
    positionId: 'pos-dev',
    positionName: 'Kỹ sư phần mềm',
  },
  manager: {
    id: 'mgr-001',
    email: 'bich.tran@company.com',
    fullName: 'Trần Thị Bích',
    role: UserRole.Manager,
    departmentId: 'dept-tech',
    departmentName: 'Phòng Công nghệ Thông tin',
    positionId: 'pos-lead',
    positionName: 'Trưởng nhóm Kỹ thuật',
  },
  hrAdmin: {
    id: 'hr-001',
    email: 'cuong.le@company.com',
    fullName: 'Lê Hoàng Cường',
    role: UserRole.HrAdmin,
    departmentId: 'dept-hr',
    departmentName: 'Phòng Nhân sự',
    positionId: 'pos-hr-lead',
    positionName: 'Trưởng phòng Nhân sự',
  },
};

export const MOCK_LEAVE_BALANCE: LeaveBalanceResponse = {
  employeeId: 'emp-001',
  balances: [
    {
      leaveType: 'ANNUAL',
      leaveTypeName: 'Nghỉ phép năm',
      totalDays: 12,
      usedDays: 2,
      availableDays: 10,
    },
    {
      leaveType: 'SICK',
      leaveTypeName: 'Nghỉ ốm / Khám bệnh',
      totalDays: 5,
      usedDays: 0,
      availableDays: 5,
    },
    {
      leaveType: 'UNPAID',
      leaveTypeName: 'Nghỉ không lương',
      totalDays: 10,
      usedDays: 0,
      availableDays: 10,
    },
  ],
};

export const MOCK_REQUESTS: RequestItem[] = [
  {
    id: 'req-001',
    employeeId: 'emp-001',
    employeeName: 'Nguyễn Văn An',
    employeeCode: 'EMP001',
    departmentName: 'Phòng Công nghệ Thông tin',
    type: RequestType.Leave,
    status: RequestStatus.Pending,
    payload: {
      leaveType: 'ANNUAL',
      startDate: '2026-10-15',
      endDate: '2026-10-16',
      daysCount: 2,
      reason: 'Giải quyết việc cá nhân gia đình',
    },
    aiRiskScore: 0.1,
    aiPolicyFindings: ['Đã gửi trước 5 ngày theo đúng quy định', 'Số dư ngày phép còn đủ (10 ngày)'],
    approverId: 'mgr-001',
    approverName: 'Trần Thị Bích',
    createdAt: '2026-10-07T08:30:00Z',
    updatedAt: '2026-10-07T08:30:00Z',
  },
  {
    id: 'req-002',
    employeeId: 'emp-001',
    employeeName: 'Nguyễn Văn An',
    employeeCode: 'EMP001',
    departmentName: 'Phòng Công nghệ Thông tin',
    type: RequestType.AttendanceExplanation,
    status: RequestStatus.Approved,
    payload: {
      date: '2026-10-02',
      checkInTime: '08:45',
      explanationType: 'FORGOT_CHECK_IN',
      reason: 'Máy chấm công vân tay cửa trước bị lỗi nhận diện',
    },
    aiRiskScore: 0.05,
    approverId: 'mgr-001',
    approverName: 'Trần Thị Bích',
    createdAt: '2026-10-02T10:00:00Z',
    updatedAt: '2026-10-02T14:20:00Z',
  },
  {
    id: 'req-003',
    employeeId: 'emp-001',
    employeeName: 'Nguyễn Văn An',
    employeeCode: 'EMP001',
    departmentName: 'Phòng Công nghệ Thông tin',
    type: RequestType.ShiftChange,
    status: RequestStatus.Rejected,
    payload: {
      shiftDate: '2026-10-05',
      currentShiftId: 'shift-morning',
      targetShiftId: 'shift-afternoon',
      reason: 'Bận việc buổi sáng',
    },
    rejectionReason: 'Ca chiều cùng ngày đã đủ quân số, ca sáng đang thiếu người.',
    approverId: 'mgr-001',
    approverName: 'Trần Thị Bích',
    createdAt: '2026-10-04T09:00:00Z',
    updatedAt: '2026-10-04T11:00:00Z',
  },
  {
    id: 'req-004',
    employeeId: 'emp-001',
    employeeName: 'Nguyễn Văn An',
    employeeCode: 'EMP001',
    departmentName: 'Phòng Công nghệ Thông tin',
    type: RequestType.Leave,
    status: RequestStatus.Draft,
    payload: {
      leaveType: 'SICK',
      startDate: '2026-10-20',
      endDate: '2026-10-20',
      daysCount: 1,
      reason: 'Hẹn khám sức khỏe định kỳ theo chỉ định bác sĩ',
    },
    aiRiskScore: 0.0,
    aiPolicyFindings: ['Được soạn thảo tự động bởi AI HR Assistant'],
    createdAt: '2026-10-07T14:15:00Z',
    updatedAt: '2026-10-07T14:15:00Z',
  },
];

/**
 * Kiểm tra xem có đang bật chế độ Mock Data hay không
 */
export function isMockEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem('hr_agent_use_mock');
  if (stored !== null) {
    return stored === 'true';
  }
  // Mặc định bật mock nếu biến môi trường VITE_USE_MOCK=true hoặc chưa có backend chạy
  return import.meta.env.VITE_USE_MOCK !== 'false';
}

export function setMockEnabled(enabled: boolean): void {
  localStorage.setItem('hr_agent_use_mock', enabled ? 'true' : 'false');
}

export function addMockRequest(item: RequestItem): void {
  MOCK_REQUESTS.unshift(item);
}

