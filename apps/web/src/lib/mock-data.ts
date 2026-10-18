import { UserRole, RequestStatus, RequestType } from '@hr-agent/shared';
import { User, RequestItem, LeaveBalanceResponse } from '../types';

export const MOCK_USERS: Record<string, User> = {
  employee: {
    id: 'emp-001',
    email: 'minhphong@gmail.com',
    fullName: 'Phạm Minh Phong',
    role: UserRole.Employee,
    departmentId: 'dept-tech',
    departmentName: 'Phòng Công nghệ Thông tin',
    positionId: 'pos-dev',
    positionName: 'Kỹ sư phần mềm',
  },
  manager: {
    id: 'mgr-001',
    email: 'tiendung@gmail.com',
    fullName: 'Nguyễn Tiến Dũng',
    role: UserRole.Manager,
    departmentId: 'dept-tech',
    departmentName: 'Phòng Công nghệ Thông tin',
    positionId: 'pos-lead',
    positionName: 'Trưởng nhóm Kỹ thuật',
  },
  hrAdmin: {
    id: 'hr-001',
    email: 'huyhoang@gmail.com',
    fullName: 'Nguyễn Huy Hoàng',
    role: UserRole.HrAdmin,
    departmentId: 'dept-hr',
    departmentName: 'Phòng Nhân sự',
    positionId: 'pos-hr-lead',
    positionName: 'Trưởng phòng Nhân sự',
  },
  admin: {
    id: 'admin-001',
    email: 'admin@gmail.com',
    fullName: 'Admin',
    role: UserRole.Admin,
    departmentId: 'dept-tech',
    departmentName: 'Phòng Công nghệ Thông tin',
    positionId: 'pos-admin',
    positionName: 'Quản trị viên Hệ thống',
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
    employeeName: 'Phạm Minh Phong',
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
    riskLevel: 'LOW',
    aiRiskScore: 0.05,
    aiConfidence: 0.95,
    policyReferences: ['LEAVE.NOTICE_DAYS', 'LEAVE.ANNUAL_DAYS_PER_YEAR'],
    aiRationale:
      'Đơn nộp trước 5 ngày làm việc (thỏa mãn quy chế ≥ 3 ngày). Số dư quỹ phép còn 10 ngày (đủ trừ 2 ngày). Tỷ lệ vắng mặt phòng IT là 0% trong ngày này. AI đề xuất PHÊ DUYỆT (Đủ điều kiện AUTO_APPROVE_LOW_RISK).',
    aiPolicyFindings: [
      'Đã gửi trước 5 ngày làm việc theo đúng quy chế LEAVE.NOTICE_DAYS',
      'Số dư ngày phép năm còn đủ khả dụng (10 / 12 ngày)',
      'Không trùng lịch bảo trì hệ thống quan trọng của phòng ban',
    ],
    timeline: [
      {
        title: 'Tạo yêu cầu',
        actor: 'Phạm Minh Phong',
        actorType: 'HUMAN',
        timestamp: '2026-10-07 08:30:00',
        description: 'Tạo đơn xin nghỉ phép năm 2 ngày qua giao diện web',
        status: 'finish',
      },
      {
        title: 'AI Agent Thẩm định quy chế',
        actor: 'HR AI Copilot',
        actorType: 'AI',
        timestamp: '2026-10-07 08:30:05',
        description: 'Đối soát RAG docs/03-policy.md: Đạt mức rủi ro LOW RISK (Độ tin cậy 95%)',
        status: 'finish',
      },
      {
        title: 'Chờ Quản lý phê duyệt',
        actor: 'Nguyễn Tiến Dũng (Trưởng nhóm)',
        actorType: 'HUMAN',
        timestamp: '2026-10-07 08:30:06',
        description: 'Đơn đang trong hàng đợi phê duyệt của cấp quản lý',
        status: 'process',
      },
    ],
    approverId: 'mgr-001',
    approverName: 'Nguyễn Tiến Dũng',
    createdAt: '2026-10-07T08:30:00Z',
    updatedAt: '2026-10-07T08:30:00Z',
  },
  {
    id: 'req-002',
    employeeId: 'emp-001',
    employeeName: 'Phạm Minh Phong',
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
    riskLevel: 'LOW',
    aiRiskScore: 0.04,
    aiConfidence: 0.98,
    policyReferences: ['ATTENDANCE.EXPLAIN_WITHIN_DAYS', 'ATTENDANCE.MAX_AUTO_PER_MONTH'],
    aiRationale:
      'Đơn giải trình nộp trong vòng 24h sau khi phát sinh sự cố (thỏa mãn quy chế ≤ 3 ngày). Nhân viên chưa dùng lượt giải trình nào trong tháng 10. AI đề xuất CHẤP THUẬN.',
    aiPolicyFindings: [
      'Nộp giải trình kịp thời theo ATTENDANCE.EXPLAIN_WITHIN_DAYS',
      'Hạn ngạch giải trình trong tháng còn 3/3 lần (hợp lệ)',
    ],
    timeline: [
      {
        title: 'Tạo đơn giải trình',
        actor: 'Phạm Minh Phong',
        actorType: 'HUMAN',
        timestamp: '2026-10-02 10:00:00',
        description: 'Nộp giải trình sự cố máy chấm công',
        status: 'finish',
      },
      {
        title: 'AI Agent Thẩm định tự động',
        actor: 'HR AI Copilot',
        actorType: 'AI',
        timestamp: '2026-10-02 10:00:03',
        description: 'Kiểm tra hạn ngạch và log camera cửa: Hợp lệ',
        status: 'finish',
      },
      {
        title: 'Quản lý phê duyệt',
        actor: 'Nguyễn Tiến Dũng',
        actorType: 'HUMAN',
        timestamp: '2026-10-02 14:20:00',
        description: 'Xác nhận sự cố cửa ra vào và phê duyệt đơn',
        status: 'finish',
      },
    ],
    approverId: 'mgr-001',
    approverName: 'Nguyễn Tiến Dũng',
    createdAt: '2026-10-02T10:00:00Z',
    updatedAt: '2026-10-02T14:20:00Z',
  },
  {
    id: 'req-003',
    employeeId: 'emp-001',
    employeeName: 'Phạm Minh Phong',
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
    riskLevel: 'MEDIUM',
    aiRiskScore: 0.45,
    aiConfidence: 0.88,
    policyReferences: ['SHIFT.MIN_STAFF_PER_SHIFT', 'SHIFT.NOTICE_HOURS'],
    aiRationale:
      'Ca chiều cùng ngày đã đủ quân số, ca sáng đang thiếu người. Việc đổi ca có nguy cơ làm vi phạm tỷ lệ nhân sự tối thiểu (SHIFT.MIN_STAFF_PER_SHIFT). AI ESCALATED cho Quản lý ra quyết định.',
    aiPolicyFindings: [
      'Vi phạm tỷ lệ nhân sự ca sáng: Dự kiến dưới định biên tối thiểu',
      'Cần có sự thỏa thuận đổi chéo với nhân sự khác thay vì chỉ đổi đơn phương',
    ],
    timeline: [
      {
        title: 'Tạo đơn đổi ca',
        actor: 'Phạm Minh Phong',
        actorType: 'HUMAN',
        timestamp: '2026-10-04 09:00:00',
        description: 'Yêu cầu chuyển từ ca sáng sang ca chiều ngày 05/10',
        status: 'finish',
      },
      {
        title: 'AI Agent Cảnh báo rủi ro',
        actor: 'HR AI Copilot',
        actorType: 'AI',
        timestamp: '2026-10-04 09:00:04',
        description: 'Phát hiện nguy cơ thiếu nhân sự ca sáng, phân loại MEDIUM RISK và Escalate cho Quản lý',
        status: 'finish',
      },
      {
        title: 'Quản lý từ chối',
        actor: 'Nguyễn Tiến Dũng',
        actorType: 'HUMAN',
        timestamp: '2026-10-04 11:00:00',
        description: 'Từ chối: Ca chiều đã đủ quân số, ca sáng không có người thay thế',
        status: 'error',
      },
    ],
    rejectionReason: 'Ca chiều cùng ngày đã đủ quân số, ca sáng đang thiếu người.',
    approverId: 'mgr-001',
    approverName: 'Nguyễn Tiến Dũng',
    createdAt: '2026-10-04T09:00:00Z',
    updatedAt: '2026-10-04T11:00:00Z',
  },
  {
    id: 'req-004',
    employeeId: 'emp-001',
    employeeName: 'Phạm Minh Phong',
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
    riskLevel: 'LOW',
    aiRiskScore: 0.02,
    aiConfidence: 0.99,
    policyReferences: ['LEAVE.SICK_BACKDATE_DAYS'],
    aiRationale: 'Bản nháp được khởi tạo tự động qua AI Assistant. Nghỉ ốm 1 ngày không bắt buộc giấy khám bệnh ngay.',
    aiPolicyFindings: ['Được soạn thảo tự động bởi AI HR Assistant trong phiên chat'],
    timeline: [
      {
        title: 'Khởi tạo bản nháp',
        actor: 'Phạm Minh Phong / AI Copilot',
        actorType: 'AI',
        timestamp: '2026-10-07 14:15:00',
        description: 'Bản nháp lưu tạm, chưa gửi phê duyệt',
        status: 'process',
      },
    ],
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

