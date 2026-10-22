import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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

    // Lấy số dư phép năm 2026 hiện tại
    const annualBalance = await this.prisma.leaveBalance.findFirst({
      where: {
        employeeId,
        year: 2026,
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
