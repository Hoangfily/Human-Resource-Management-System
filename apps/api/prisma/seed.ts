import {
  AutonomyLevel,
  EmployeeStatus,
  PrismaClient,
  RequestType,
  Role,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Đang bắt đầu nạp dữ liệu mẫu (Seeding Database) ---');

  // 1. Tạo các Phòng ban (Departments)
  const itDept = await prisma.department.upsert({
    where: { name: 'Phòng Công nghệ Thông tin' },
    update: {},
    create: {
      name: 'Phòng Công nghệ Thông tin',
      description: 'Phát triển phần mềm, hạ tầng kỹ thuật và giải pháp AI',
    },
  });

  const hrDept = await prisma.department.upsert({
    where: { name: 'Phòng Nhân sự' },
    update: {},
    create: {
      name: 'Phòng Nhân sự',
      description: 'Quản trị nhân tài, chính sách đãi ngộ và quan hệ lao động',
    },
  });

  // 2. Tạo các Chức danh (Positions)
  const devPos = await prisma.position.upsert({
    where: { title: 'Kỹ sư phần mềm' },
    update: {},
    create: { title: 'Kỹ sư phần mềm' },
  });

  const leadPos = await prisma.position.upsert({
    where: { title: 'Trưởng nhóm Kỹ thuật' },
    update: {},
    create: { title: 'Trưởng nhóm Kỹ thuật' },
  });

  const hrLeadPos = await prisma.position.upsert({
    where: { title: 'Trưởng phòng Nhân sự' },
    update: {},
    create: { title: 'Trưởng phòng Nhân sự' },
  });

  const adminPos = await prisma.position.upsert({
    where: { title: 'Quản trị viên Hệ thống' },
    update: {},
    create: { title: 'Quản trị viên Hệ thống' },
  });

  // 3. Tạo Mẫu ca làm việc mặc định (ShiftTemplate)
  const standardShift = await prisma.shiftTemplate.upsert({
    where: { name: 'Ca hành chính tiêu chuẩn' },
    update: {},
    create: {
      name: 'Ca hành chính tiêu chuẩn',
      startTime: '08:30',
      endTime: '17:30',
    },
  });

  // 4. Tạo các Nhân viên nòng cốt (Employees matching 3 Quick-login buttons)
  // 4.1 Quản trị viên cao cấp
  const admin = await prisma.employee.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      email: 'admin@company.com',
      fullName: 'System Admin',
      phone: '0900000001',
      role: Role.ADMIN,
      status: EmployeeStatus.ACTIVE,
      departmentId: hrDept.id,
      positionId: adminPos.id,
      defaultShiftId: standardShift.id,
    },
  });

  // 4.2 Quản lý trực tiếp (Manager) - Bích Trần
  const manager = await prisma.employee.upsert({
    where: { email: 'bich.tran@company.com' },
    update: {},
    create: {
      email: 'bich.tran@company.com',
      fullName: 'Trần Thị Bích',
      phone: '0912345678',
      role: Role.MANAGER,
      status: EmployeeStatus.ACTIVE,
      departmentId: itDept.id,
      positionId: leadPos.id,
      defaultShiftId: standardShift.id,
    },
  });

  // 4.3 Nhân viên cấp dưới (Employee) - An Nguyễn (Quản lý là Bích Trần)
  const employee = await prisma.employee.upsert({
    where: { email: 'an.nguyen@company.com' },
    update: {
      managerId: manager.id,
    },
    create: {
      email: 'an.nguyen@company.com',
      fullName: 'Nguyễn Văn An',
      phone: '0987654321',
      role: Role.EMPLOYEE,
      status: EmployeeStatus.ACTIVE,
      departmentId: itDept.id,
      positionId: devPos.id,
      managerId: manager.id,
      defaultShiftId: standardShift.id,
    },
  });

  // 4.4 Quản trị viên HR - Cường Lê
  const hrAdmin = await prisma.employee.upsert({
    where: { email: 'cuong.le@company.com' },
    update: {},
    create: {
      email: 'cuong.le@company.com',
      fullName: 'Lê Hoàng Cường',
      phone: '0901234567',
      role: Role.HR,
      status: EmployeeStatus.ACTIVE,
      departmentId: hrDept.id,
      positionId: hrLeadPos.id,
      defaultShiftId: standardShift.id,
    },
  });

  // 5. Tạo Danh mục Loại nghỉ phép (Leave Types)
  const leaveTypesData = [
    { code: 'ANNUAL', name: 'Nghỉ phép năm' },
    { code: 'SICK', name: 'Nghỉ ốm đau / Khám bệnh' },
    { code: 'UNPAID', name: 'Nghỉ không lương' },
    { code: 'PERSONAL', name: 'Nghỉ việc riêng có lương' },
  ];

  const createdLeaveTypes: Record<string, string> = {};
  for (const lt of leaveTypesData) {
    const item = await prisma.leaveType.upsert({
      where: { code: lt.code },
      update: {},
      create: lt,
    });
    createdLeaveTypes[lt.code] = item.id;
  }

  // 6. Cấp Quỹ ngày phép năm 2026 (Leave Balances)
  // An Nguyễn: 12 ngày phép năm, đã dùng 2, khả dụng 10 ngày
  if (createdLeaveTypes['ANNUAL']) {
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: employee.id,
          leaveTypeId: createdLeaveTypes['ANNUAL'],
          year: 2026,
        },
      },
      update: { totalDays: 12, usedDays: 2, pendingDays: 0 },
      create: {
        employeeId: employee.id,
        leaveTypeId: createdLeaveTypes['ANNUAL'],
        year: 2026,
        totalDays: 12,
        usedDays: 2,
        pendingDays: 0,
      },
    });

    // Quản lý Bích Trần: 15 ngày phép năm
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: manager.id,
          leaveTypeId: createdLeaveTypes['ANNUAL'],
          year: 2026,
        },
      },
      update: { totalDays: 15, usedDays: 3, pendingDays: 0 },
      create: {
        employeeId: manager.id,
        leaveTypeId: createdLeaveTypes['ANNUAL'],
        year: 2026,
        totalDays: 15,
        usedDays: 3,
        pendingDays: 0,
      },
    });

    // HR Cường Lê: 14 ngày phép năm
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: hrAdmin.id,
          leaveTypeId: createdLeaveTypes['ANNUAL'],
          year: 2026,
        },
      },
      update: { totalDays: 14, usedDays: 1, pendingDays: 0 },
      create: {
        employeeId: hrAdmin.id,
        leaveTypeId: createdLeaveTypes['ANNUAL'],
        year: 2026,
        totalDays: 14,
        usedDays: 1,
        pendingDays: 0,
      },
    });
  }

  // Cấp phép ốm (5 ngày) và phép không hưởng lương (10 ngày) cho An Nguyễn
  if (createdLeaveTypes['SICK']) {
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: employee.id,
          leaveTypeId: createdLeaveTypes['SICK'],
          year: 2026,
        },
      },
      update: { totalDays: 5, usedDays: 0, pendingDays: 0 },
      create: {
        employeeId: employee.id,
        leaveTypeId: createdLeaveTypes['SICK'],
        year: 2026,
        totalDays: 5,
        usedDays: 0,
        pendingDays: 0,
      },
    });
  }

  if (createdLeaveTypes['UNPAID']) {
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: employee.id,
          leaveTypeId: createdLeaveTypes['UNPAID'],
          year: 2026,
        },
      },
      update: { totalDays: 10, usedDays: 0, pendingDays: 0 },
      create: {
        employeeId: employee.id,
        leaveTypeId: createdLeaveTypes['UNPAID'],
        year: 2026,
        totalDays: 10,
        usedDays: 0,
        pendingDays: 0,
      },
    });
  }

  // 7. Cấu hình Mức tự chủ AI mặc định (AutonomyConfig per RequestType)
  const autonomyDefaults = [
    { requestType: RequestType.LEAVE, level: AutonomyLevel.AUTO_DECIDE_LOW_RISK },
    { requestType: RequestType.OVERTIME, level: AutonomyLevel.AUTO_APPROVE_LOW_RISK },
    { requestType: RequestType.ATTENDANCE_EXPLANATION, level: AutonomyLevel.AUTO_APPROVE_LOW_RISK },
    { requestType: RequestType.SHIFT_CHANGE, level: AutonomyLevel.AUTO_DECIDE_LOW_RISK },
  ];
  for (const config of autonomyDefaults) {
    await prisma.autonomyConfig.upsert({
      where: { requestType: config.requestType },
      update: {},
      create: { ...config, minConfidence: 0.85, updatedById: admin.id },
    });
  }

  // 8. Nạp Quy chế nội bộ chuẩn theo docs/03-policy.md (Company Policies)
  const policies = [
    {
      key: 'LEAVE.ANNUAL_DAYS_PER_YEAR',
      version: '2026.10-draft',
      title: 'Số ngày phép năm tiêu chuẩn',
      content: 'Mỗi nhân viên chính thức có tiêu chuẩn 12 ngày phép năm hưởng nguyên lương. Cứ mỗi 5 năm làm việc được cộng thêm 1 ngày.',
    },
    {
      key: 'LEAVE.NOTICE_DAYS',
      version: '2026.10-draft',
      title: 'Thời hạn báo trước khi nghỉ phép',
      content: 'Nghỉ 1-2 ngày phải nộp đơn trước ít nhất 3 ngày làm việc. Nghỉ trên 2 ngày liên tiếp phải nộp đơn trước ít nhất 7 ngày làm việc.',
    },
    {
      key: 'LEAVE.SICK_CERT_REQUIRED_AFTER_DAYS',
      version: '2026.10-draft',
      title: 'Yêu cầu giấy khám bệnh khi nghỉ ốm',
      content: 'Nghỉ ốm trên 2 ngày làm việc liên tiếp bắt buộc đính kèm giấy chứng nhận nghỉ việc hưởng BHXH của cơ sở khám chữa bệnh.',
    },
    {
      key: 'LEAVE.PERSONAL_DAYS',
      version: '2026.10-draft',
      title: 'Chế độ nghỉ việc riêng có lương',
      content: 'Bản thân kết hôn: 3 ngày; Con kết hôn: 1 ngày; Tứ thân phụ mẫu/vợ/chồng/con mất: 3 ngày.',
    },
    {
      key: 'OT.MAX_HOURS_PER_MONTH',
      version: '2026.10-draft',
      title: 'Giờ làm thêm tối đa trong tháng',
      content: 'Tổng số giờ làm thêm tối đa không quá 40 giờ trong một tháng và không quá 200 giờ trong một năm.',
    },
    {
      key: 'OT.MAX_TOTAL_HOURS_PER_DAY',
      version: '2026.10-draft',
      title: 'Tổng giờ làm việc tối đa trong ngày',
      content: 'Tổng giờ làm việc tiêu chuẩn + làm thêm giờ không được vượt quá 12 giờ/ngày.',
    },
    {
      key: 'ATTENDANCE.EXPLAIN_WITHIN_DAYS',
      version: '2026.10-draft',
      title: 'Thời hạn nộp giải trình chấm công',
      content: 'Nhân viên quên quẹt thẻ, quẹt muộn do sự cố hệ thống phải gửi đơn giải trình trong vòng 3 ngày làm việc kể từ ngày phát sinh.',
    },
    {
      key: 'ATTENDANCE.MAX_AUTO_PER_MONTH',
      version: '2026.10-draft',
      title: 'Hạn mức giải trình tự động trong tháng',
      content: 'Tối đa 3 lần giải trình tự động/tháng được AI xem xét. Vượt quá 3 lần đơn sẽ bị chuyển sang cấp thẩm định.',
    },
    {
      key: 'ATTENDANCE.GRACE_PERIOD_MINUTES',
      version: '2026.10-draft',
      title: 'Thời gian ân hạn đi muộn',
      content: 'Thời gian ân hạn tối đa cho phép đến muộn là 15 phút mỗi ca làm việc.',
    },
  ];

  for (const pol of policies) {
    await prisma.companyPolicy.upsert({
      where: {
        key_version: {
          key: pol.key,
          version: pol.version,
        },
      },
      update: {},
      create: pol,
    });
  }

  console.log('--- Hoàn tất nạp dữ liệu mẫu (Seeding Thành Công)! ---');
  console.log('1. Admin:     admin@company.com     (Role: ADMIN)');
  console.log('2. Manager:   bich.tran@company.com (Role: MANAGER)');
  console.log('3. Employee:  an.nguyen@company.com  (Role: EMPLOYEE, Quản lý: bich.tran)');
  console.log('4. HR Admin:  cuong.le@company.com   (Role: HR)');
  console.log(`Đã nạp ${policies.length} quy chuẩn chính sách công ty và quỹ ngày phép 2026.`);
}

main()
  .catch((e) => {
    console.error('Lỗi khi seed dữ liệu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
