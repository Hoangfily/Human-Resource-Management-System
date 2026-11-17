import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { currentYear } from '../../common/utils/company-date';
import { generateTemporaryPassword, hashPassword } from '../auth/password.util';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createEmployee(
    caller: { id: string; role: string },
    dto: CreateEmployeeDto,
  ) {
    if (caller.role !== 'ADMIN' && caller.role !== 'HR') {
      throw new ForbiddenException(
        'Chỉ Quản trị viên (ADMIN) hoặc Nhân sự (HR) mới có quyền tạo nhân viên mới',
      );
    }

    // HR chỉ tạo được EMPLOYEE/MANAGER: nếu không, HR tự tạo tài khoản ADMIN rồi đăng nhập bằng mật khẩu tạm trả về
    const newRole = dto.role || 'EMPLOYEE';
    if ((newRole === 'ADMIN' || newRole === 'HR') && caller.role !== 'ADMIN') {
      throw new ForbiddenException('Chỉ Quản trị viên (ADMIN) mới được tạo tài khoản HR hoặc ADMIN');
    }

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.employee.findUnique({
      where: { email },
    });
    if (existing) {
      throw new BadRequestException(`Email "${email}" đã tồn tại trong hệ thống`);
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const employee = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          email,
          fullName: dto.fullName.trim(),
          phone: dto.phone?.trim() || null,
          role: newRole as any,
          status: (dto.status as any) || 'ACTIVE',
          passwordHash,
          mustChangePassword: true, // Mật khẩu tạm: nhân viên phải đổi ở lần đăng nhập đầu
          departmentId: dto.departmentId || null,
          positionId: dto.positionId || null,
          managerId: dto.managerId || null,
          defaultShiftId: dto.defaultShiftId || null,
          joinDate: dto.joinDate ? new Date(dto.joinDate) : new Date(),
        },
      });

      // Tự động khởi tạo quỹ phép năm hiện tại với 12 ngày phép
      const annualLeaveType = await tx.leaveType.findFirst({
        where: { code: 'ANNUAL' },
      });

      if (annualLeaveType) {
        await tx.leaveBalance.create({
          data: {
            employeeId: created.id,
            leaveTypeId: annualLeaveType.id,
            year: currentYear(),
            totalDays: 12,
            usedDays: 0,
            pendingDays: 0,
          },
        });
      }

      // Ghi nhật ký kiểm toán AuditLog
      await tx.auditLog.create({
        data: {
          actorType: 'HUMAN',
          actorId: caller.id,
          action: 'CREATE_EMPLOYEE',
          entityType: 'Employee',
          entityId: created.id,
          payload: {
            fullName: created.fullName,
            email: created.email,
            role: created.role,
            departmentId: created.departmentId,
            positionId: created.positionId,
          },
        },
      });

      return created;
    });

    // Mật khẩu tạm chỉ hiện ở đây một lần: không lưu dạng rõ ở đâu, không ghi vào nhật ký
    return { ...(await this.getProfile(employee.id)), temporaryPassword };
  }

  /** HR/Admin cấp lại mật khẩu tạm cho một nhân viên (quên mật khẩu, bị khóa…). */
  async resetPassword(caller: { id: string; role: string }, targetId: string) {
    if (caller.role !== 'ADMIN' && caller.role !== 'HR') {
      throw new ForbiddenException('Chỉ Quản trị viên (ADMIN) hoặc Nhân sự (HR) mới được cấp lại mật khẩu');
    }
    const target = await this.prisma.employee.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException('Không tìm thấy nhân viên');
    }
    if (target.id === caller.id) {
      throw new BadRequestException('Hãy dùng chức năng Đổi mật khẩu cho tài khoản của chính bạn');
    }
    // Nếu HR đặt lại được mật khẩu của ADMIN thì HR chiếm được tài khoản ADMIN
    if ((target.role === 'ADMIN' || target.role === 'HR') && caller.role !== 'ADMIN') {
      throw new ForbiddenException('Chỉ Quản trị viên (ADMIN) mới được cấp lại mật khẩu của HR hoặc ADMIN');
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    await this.prisma.$transaction([
      this.prisma.employee.update({
        where: { id: target.id },
        data: {
          passwordHash,
          mustChangePassword: true,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.refreshSession.deleteMany({ where: { employeeId: target.id } }), // Đăng xuất mọi thiết bị
      this.prisma.auditLog.create({
        data: {
          actorType: 'HUMAN',
          actorId: caller.id,
          action: 'RESET_PASSWORD',
          entityType: 'Employee',
          entityId: target.id,
          payload: { email: target.email }, // Không ghi mật khẩu vào nhật ký
        },
      }),
    ]);

    return { employeeId: target.id, email: target.email, temporaryPassword, mustChangePassword: true };
  }

  async getProfile(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        department: true,
        position: true,
        defaultShift: true,
        manager: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Không tìm thấy thông tin nhân viên');
    }

    // Lấy số dư phép năm hiện tại
    const annualBalance = await this.prisma.leaveBalance.findFirst({
      where: {
        employeeId,
        year: currentYear(),
        leaveType: { code: 'ANNUAL' },
      },
    });

    const leaveBalanceRemaining = annualBalance
      ? annualBalance.totalDays - annualBalance.usedDays - annualBalance.pendingDays
      : 12;

    return {
      id: employee.id,
      email: employee.email,
      fullName: employee.fullName,
      role: employee.role,
      status: employee.status,
      phone: employee.phone,
      avatarUrl: employee.avatarUrl,
      departmentId: employee.departmentId,
      departmentName: employee.department?.name,
      positionId: employee.positionId,
      positionName: employee.position?.title,
      managerId: employee.managerId,
      managerName: employee.manager?.fullName,
      managerEmail: employee.manager?.email,
      defaultShiftId: employee.defaultShiftId,
      defaultShiftName: employee.defaultShift?.name,
      shiftTime: employee.defaultShift
        ? `${employee.defaultShift.startTime} - ${employee.defaultShift.endTime}`
        : '08:30 - 17:30',
      joinDate: employee.joinDate,
      leaveBalanceRemaining,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    };
  }

  async getEmployeeById(caller: { id: string; role: string }, targetId: string) {
    if (caller.id !== targetId) {
      if (caller.role === 'EMPLOYEE') {
        throw new ForbiddenException('Bạn không có quyền xem hồ sơ của nhân viên khác');
      }

      if (caller.role === 'MANAGER') {
        const target = await this.prisma.employee.findUnique({
          where: { id: targetId },
          select: { managerId: true },
        });

        if (!target || target.managerId !== caller.id) {
          throw new ForbiddenException(
            'Quản lý chỉ có quyền xem hồ sơ của nhân viên cấp dưới trực tiếp',
          );
        }
      }
    }

    return this.getProfile(targetId);
  }

  async listEmployees(
    caller: { id: string; role: string },
    query?: { departmentId?: string; search?: string },
  ) {
    const where: any = {};

    if (query?.departmentId) {
      where.departmentId = query.departmentId;
    }

    if (query?.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Nếu là Manager, ưu tiên hiển thị nhân viên trực thuộc hoặc cùng phòng ban
    if (caller.role === 'MANAGER') {
      where.OR = [
        { managerId: caller.id },
        { id: caller.id },
      ];
    }

    const employees = await this.prisma.employee.findMany({
      where,
      include: {
        department: true,
        position: true,
        manager: {
          select: { id: true, fullName: true, email: true },
        },
      },
      orderBy: { fullName: 'asc' },
    });

    return employees.map((emp) => ({
      id: emp.id,
      email: emp.email,
      fullName: emp.fullName,
      role: emp.role,
      status: emp.status,
      phone: emp.phone,
      departmentId: emp.departmentId,
      departmentName: emp.department?.name,
      positionId: emp.positionId,
      positionName: emp.position?.title,
      managerId: emp.managerId,
      managerName: emp.manager?.fullName,
    }));
  }

  async updateProfile(employeeId: string, dto: UpdateProfileDto) {
    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      },
    });

    return this.getProfile(updated.id);
  }
}
