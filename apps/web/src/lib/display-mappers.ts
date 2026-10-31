/**
 * TẦNG TỪ ĐIỂN HIỂN THỊ (DISPLAY MAPPERS) - HR AGENT ENTERPRISE SYSTEM
 * Chuẩn hóa 100% thuật ngữ hiển thị cho người dùng công sở, loại bỏ toàn bộ mã code thô / enum IT.
 */

export interface StatusMeta {
  label: string;
  shortLabel: string;
  tagColor: string;
  badgeStatus: 'success' | 'processing' | 'default' | 'error' | 'warning';
  bg: string;
  border: string;
  description: string;
}

export interface TypeMeta {
  label: string;
  shortLabel: string;
  tagColor: string;
  bg: string;
  border: string;
  description: string;
}

export interface RiskMeta {
  label: string;
  shortLabel: string;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  tagColor: string;
  bg: string;
  border: string;
  badgeText: string;
  description: string;
}

export interface AutonomyMeta {
  label: string;
  shortLabel: string;
  tagColor: string;
  bg: string;
  border: string;
  description: string;
  recommended?: boolean;
}

// 1. BẢN ĐỒ TRẠNG THÁI YÊU CẦU / ĐƠN TỪ
export const REQUEST_STATUS_MAP: Record<string, StatusMeta> = {
  DRAFT: {
    label: 'Bản nháp',
    shortLabel: 'Nháp',
    tagColor: '#64748b',
    badgeStatus: 'default',
    bg: '#f8fafc',
    border: '#cbd5e1',
    description: 'Đơn đang được soạn thảo, chưa gửi tới người phê duyệt.',
  },
  PENDING: {
    label: 'Chờ phê duyệt',
    shortLabel: 'Chờ duyệt',
    tagColor: '#d97706',
    badgeStatus: 'processing',
    bg: '#fffbeb',
    border: '#fde68a',
    description: 'Đơn đã nộp và đang đợi Quản lý xem xét.',
  },
  APPROVED: {
    label: 'Đã phê duyệt',
    shortLabel: 'Đã duyệt',
    tagColor: '#059669',
    badgeStatus: 'success',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    description: 'Đơn đã được phê duyệt và cập nhật vào quỹ phép / lịch làm việc.',
  },
  REJECTED: {
    label: 'Từ chối phê duyệt',
    shortLabel: 'Từ chối',
    tagColor: '#dc2626',
    badgeStatus: 'error',
    bg: '#fef2f2',
    border: '#fecaca',
    description: 'Đơn không được chấp thuận bởi cấp quản lý hoặc vi phạm quy chế.',
  },
  ESCALATED: {
    label: 'Chuyển cấp thẩm định HR',
    shortLabel: 'Chuyển HR',
    tagColor: '#7c3aed',
    badgeStatus: 'warning',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    description: 'Đơn cần sự thẩm định chuyên sâu từ Bộ phận Nhân sự (HR).',
  },
  CANCELLED: {
    label: 'Đã hủy yêu cầu',
    shortLabel: 'Đã hủy',
    tagColor: '#94a3b8',
    badgeStatus: 'default',
    bg: '#f1f5f9',
    border: '#e2e8f0',
    description: 'Đơn đã được người gửi thu hồi.',
  },
};

// 2. BẢN ĐỒ LOẠI YÊU CẦU / ĐƠN TỪ
export const REQUEST_TYPE_MAP: Record<string, TypeMeta> = {
  LEAVE: {
    label: 'Đơn xin nghỉ phép',
    shortLabel: 'Nghỉ phép',
    tagColor: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    description: 'Nghỉ phép năm, nghỉ ốm đau, việc hiếu, việc hỷ hoặc thai sản.',
  },
  OVERTIME: {
    label: 'Đăng ký làm thêm giờ (OT)',
    shortLabel: 'Làm thêm giờ (OT)',
    tagColor: '#ea580c',
    bg: '#fff7ed',
    border: '#fed7aa',
    description: 'Làm thêm giờ vào ngày làm việc thường, cuối tuần hoặc ngày lễ.',
  },
  ATTENDANCE_EXPLANATION: {
    label: 'Giải trình chấm công',
    shortLabel: 'Giải trình công',
    tagColor: '#0284c7',
    bg: '#f0f9ff',
    border: '#bae6fd',
    description: 'Giải trình sự cố quên quẹt thẻ vào/ra, đi muộn hoặc về sớm.',
  },
  SHIFT_CHANGE: {
    label: 'Hoán đổi ca làm việc',
    shortLabel: 'Đổi ca trực',
    tagColor: '#9333ea',
    bg: '#faf5ff',
    border: '#e9d5ff',
    description: 'Yêu cầu hoán đổi ca trực hoặc lịch làm việc với đồng nghiệp.',
  },
};

// 3. BẢN ĐỒ MỨC ĐỘ RỦI RO & ĐỘ TIN CẬY
export function getRiskMeta(riskLevel?: string, score?: number): RiskMeta {
  const level = (riskLevel || (score !== undefined && score > 0.4 ? 'HIGH' : score !== undefined && score > 0.15 ? 'MEDIUM' : 'LOW')).toUpperCase();

  if (level === 'HIGH') {
    return {
      label: 'Rủi ro cao (Cần kiểm tra kỹ)',
      shortLabel: 'Rủi ro cao',
      level: 'HIGH',
      tagColor: '#dc2626',
      bg: '#fef2f2',
      border: '#fecaca',
      badgeText: 'Cần cấp thẩm định HR xem xét',
      description: 'Yêu cầu vượt ngưỡng tự động hoặc cần bổ sung tài liệu minh chứng.',
    };
  }

  if (level === 'MEDIUM') {
    return {
      label: 'Cần lưu ý (Rủi ro vừa)',
      shortLabel: 'Lưu ý',
      level: 'MEDIUM',
      tagColor: '#d97706',
      bg: '#fffbeb',
      border: '#fde68a',
      badgeText: 'Cần Quản lý xem xét chi tiết',
      description: 'Thời gian báo trước sát ngày quy định hoặc ảnh hưởng nhân sự ca trực.',
    };
  }

  return {
    label: 'An toàn (Đủ điều kiện duyệt)',
    shortLabel: 'An toàn',
    level: 'LOW',
    tagColor: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    badgeText: 'Khuyến nghị phê duyệt',
    description: 'Đơn hoàn toàn tuân thủ quy chế công ty và quỹ ngày phép đáp ứng đủ.',
  };
}

// 4. BẢN ĐỒ CẤP ĐỘ TỰ CHỦ CỦA TRỢ LÝ AI
export const AUTONOMY_LEVEL_MAP: Record<string, AutonomyMeta> = {
  SUGGEST_ONLY: {
    label: '1. Chỉ đề xuất (Mọi đơn đều cần người duyệt)',
    shortLabel: 'Chỉ gợi ý',
    tagColor: '#3b82f6',
    bg: '#eff6ff',
    border: '#bfdbfe',
    description: 'AI chỉ tra cứu quy chế, giải thích chính sách và dự thảo đơn. Mọi quyết định phê duyệt đều do Quản lý đảm trách.',
  },
  AUTO_APPROVE_LOW_RISK: {
    label: '2. Tự động duyệt đơn an toàn (Khuyên dùng)',
    shortLabel: 'Duyệt đơn an toàn',
    tagColor: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    description: 'AI tự động phê duyệt các đơn hợp lệ có mức rủi ro thấp. Mọi trường hợp nghi vấn hoặc rủi ro vừa/cao đều chuyển con người thẩm định.',
    recommended: true,
  },
  AUTO_DECIDE_LOW_RISK: {
    label: '3. Tự động xử lý toàn diện (Duyệt & Từ chối)',
    shortLabel: 'Toàn quyền rủi ro thấp',
    tagColor: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    description: 'AI được phép ra quyết định cả Chấp thuận và Từ chối đối với các đơn rủi ro thấp khi độ tin cậy đạt ngưỡng cấu hình.',
  },
};

// 5. BẢN ĐỒ QUY CHẾ CÔNG TY (XÓA BỎ MÃ CODE / FILE MARKDOWN)
export const POLICY_DISPLAY_MAP: Record<
  string,
  { title: string; category: string; description: string; legalRef: string }
> = {
  'LEAVE.NOTICE_DAYS': {
    title: 'Quy định thời hạn báo trước khi nghỉ phép',
    category: 'Chế độ Nghỉ phép',
    description: 'Nghỉ 1-2 ngày phải báo trước tối thiểu 3 ngày làm việc. Nghỉ từ 3 ngày trở lên phải nộp đơn trước 7 ngày làm việc.',
    legalRef: 'Điều 113 Bộ luật Lao động 2019 & Quy chế HR',
  },
  'LEAVE.ANNUAL_DAYS_PER_YEAR': {
    title: 'Tiêu chuẩn ngày phép năm hưởng nguyên lương',
    category: 'Chế độ Nghỉ phép',
    description: 'Mỗi nhân sự chính thức có tiêu chuẩn 12 ngày phép năm. Cứ mỗi 5 năm làm việc được cộng thêm 1 ngày phép thâm niên.',
    legalRef: 'Điều 113, 114 Bộ luật Lao động 2019',
  },
  'LEAVE.SICK_CERT_REQUIRED_AFTER_DAYS': {
    title: 'Giấy khám bệnh y tế khi nghỉ ốm đau',
    category: 'Chế độ Nghỉ phép',
    description: 'Nghỉ ốm trên 02 ngày làm việc liên tiếp bắt buộc đính kèm giấy chứng nhận khám bệnh của cơ sở y tế theo chế độ BHXH.',
    legalRef: 'Luật Bảo hiểm xã hội 2014',
  },
  'LEAVE.PROBATION_ACCRUAL': {
    title: 'Tích lũy phép trong thời gian thử việc',
    category: 'Chế độ Nghỉ phép',
    description: 'Thời gian thử việc được tính dồn ngày phép sau khi ký hợp đồng lao động chính thức.',
    legalRef: 'Quy chế Nội bộ Doanh nghiệp',
  },
  'OT.MAX_HOURS_PER_MONTH': {
    title: 'Trần thời gian làm thêm giờ trong tháng (40 giờ)',
    category: 'Chế độ Làm thêm giờ (OT)',
    description: 'Tổng số giờ làm thêm của nhân viên không được vượt quá 40 giờ trong một tháng dương lịch.',
    legalRef: 'Điều 107 Bộ luật Lao động 2019',
  },
  'OT.MAX_TOTAL_HOURS_PER_DAY': {
    title: 'Tổng giờ làm việc tối đa trong ngày (12 giờ)',
    category: 'Chế độ Làm thêm giờ (OT)',
    description: 'Tổng giờ làm việc bình thường cộng thêm giờ làm thêm không vượt quá 12 giờ trong một ngày.',
    legalRef: 'Điều 107 Bộ luật Lao động 2019',
  },
  'ATTENDANCE.EXPLAIN_WITHIN_DAYS': {
    title: 'Thời hạn gửi đơn giải trình chấm công',
    category: 'Kỷ luật Chấm công',
    description: 'Nhân viên có tối đa 03 ngày làm việc kể từ thời điểm phát sinh sự cố quên quẹt thẻ / đi muộn để gửi đơn giải trình.',
    legalRef: 'Nội quy Lao động Doanh nghiệp',
  },
  'ATTENDANCE.MAX_AUTO_PER_MONTH': {
    title: 'Hạn mức giải trình chấm công trong tháng',
    category: 'Kỷ luật Chấm công',
    description: 'Mỗi nhân viên được duyệt tối đa 03 lần giải trình sự cố chấm công trong một tháng.',
    legalRef: 'Nội quy Lao động Doanh nghiệp',
  },
  'ATTENDANCE.GRACE_PERIOD_MINUTES': {
    title: 'Thời gian ân hạn đi muộn đầu ca',
    category: 'Kỷ luật Chấm công',
    description: 'Ân hạn tối đa 15 phút đầu ca làm việc không bị ghi nhận vi phạm kỷ luật chuyên cần.',
    legalRef: 'Nội quy Lao động Doanh nghiệp',
  },
};

// 6. BẢN ĐỒ VAI TRÒ / PHÂN QUYỀN
export const ROLE_DISPLAY_MAP: Record<
  string,
  { label: string; color: string; tagColor: string; description: string }
> = {
  EMPLOYEE: {
    label: 'Nhân viên',
    color: 'blue',
    tagColor: '#0284c7',
    description: 'Tạo đơn từ, theo dõi chấm công, xem lịch ca và tương tác với Trợ lý AI.',
  },
  MANAGER: {
    label: 'Quản lý Bộ phận',
    color: 'purple',
    tagColor: '#7c3aed',
    description: 'Phê duyệt đơn từ của nhân viên cấp dưới, quản lý ca làm việc và phân công.',
  },
  HR: {
    label: 'Quản trị Nhân sự (HR)',
    color: 'emerald',
    tagColor: '#059669',
    description: 'Quản lý toàn diện nhân sự, chính sách công ty và xử lý các đơn chuyển cấp thẩm định.',
  },
  ADMIN: {
    label: 'Quản trị Hệ thống',
    color: 'slate',
    tagColor: '#0f172a',
    description: 'Toàn quyền cấu hình hệ thống, thiết lập mức tự chủ AI và cơ cấu tổ chức.',
  },
};

// 7. LOẠI NGHỈ PHÉP
export const LEAVE_TYPE_MAP: Record<string, { label: string; tagColor: string }> = {
  ANNUAL: { label: 'Nghỉ phép năm', tagColor: '#059669' },
  SICK: { label: 'Nghỉ ốm đau (Hưởng BHXH)', tagColor: '#0284c7' },
  WEDDING: { label: 'Nghỉ kết hôn', tagColor: '#ec4899' },
  FUNERAL: { label: 'Nghỉ việc hiếu', tagColor: '#475569' },
  MATERNITY: { label: 'Nghỉ thai sản', tagColor: '#8b5cf6' },
  UNPAID: { label: 'Nghỉ không lương', tagColor: '#64748b' },
};

// 8. TÊN CA LÀM VIỆC
export const SHIFT_TEMPLATE_MAP: Record<string, { label: string; time: string; tagColor: string }> = {
  CA_SANG: { label: 'Ca Sáng', time: '08:30 - 17:30', tagColor: '#059669' },
  CA_CHIEU: { label: 'Ca Chiều', time: '13:00 - 21:00', tagColor: '#ea580c' },
  CA_DEM: { label: 'Ca Đêm', time: '21:00 - 05:00', tagColor: '#7c3aed' },
  NGHI_CA: { label: 'Nghỉ theo lịch', time: '—', tagColor: '#94a3b8' },
};

// Helper chuyển đổi an toàn
export function formatRequestStatus(status?: string): StatusMeta {
  if (!status) return REQUEST_STATUS_MAP.DRAFT;
  const key = status.toUpperCase();
  return REQUEST_STATUS_MAP[key] || {
    label: status,
    shortLabel: status,
    tagColor: '#64748b',
    badgeStatus: 'default',
    bg: '#f8fafc',
    border: '#cbd5e1',
    description: 'Trạng thái xử lý',
  };
}

export function formatRequestType(type?: string): TypeMeta {
  if (!type) return REQUEST_TYPE_MAP.LEAVE;
  const key = type.toUpperCase();
  return REQUEST_TYPE_MAP[key] || {
    label: type,
    shortLabel: type,
    tagColor: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    description: 'Loại yêu cầu nhân sự',
  };
}

export function formatPolicyName(policyKey: string): string {
  return POLICY_DISPLAY_MAP[policyKey]?.title || policyKey.replace(/_/g, ' ').toLowerCase();
}
