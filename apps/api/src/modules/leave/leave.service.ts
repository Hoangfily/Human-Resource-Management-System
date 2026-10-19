import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(
    caller: { id: string; role: string },
    queryEmployeeId?: string,
    queryYear?: number,
  ) {
    const targetEmployeeId = queryEmployeeId || caller.id;
    const year = queryYear || 2026;

    // Kiểm tra quyền hạn khi xem quỹ phép người khác
    if (targetEmployeeId !== caller.id) {
      if (caller.role === 'EMPLOYEE') {
        throw new ForbiddenException(
          'Nhân viên chỉ có quyền xem quỹ phép của chính mình',
        );
      }

      if (caller.role === 'MANAGER') {
        const target = await this.prisma.employee.findUnique({
          where: { id: targetEmployeeId },
          select: { managerId: true },
        });

        if (!target) {
          throw new NotFoundException('Không tìm thấy nhân viên');
        }

        if (target.managerId !== caller.id) {
          throw new ForbiddenException(
            'Quản lý chỉ có quyền xem quỹ phép của nhân viên trực thuộc',
          );
        }
      }
    }

    // Kiểm tra nhân viên có tồn tại
    const employee = await this.prisma.employee.findUnique({
      where: { id: targetEmployeeId },
      select: { id: true, fullName: true, email: true },
    });

    if (!employee) {
      throw new NotFoundException('Không tìm thấy thông tin nhân viên');
    }

    // Truy vấn số dư quỹ phép từ PostgreSQL
    let dbBalances = await this.prisma.leaveBalance.findMany({
      where: {
        employeeId: targetEmployeeId,
        year,
      },
      include: {
        leaveType: true,
      },
      orderBy: {
        leaveType: { code: 'asc' },
      },
    });

    // Nếu chưa có dữ liệu quỹ phép năm này, tự động khởi tạo mặc định theo chính sách
    if (dbBalances.length === 0) {
      const allTypes = await this.prisma.leaveType.findMany();
      for (const lt of allTypes) {
        let defaultTotal = 0;
        if (lt.code === 'ANNUAL') defaultTotal = 12;
        if (lt.code === 'SICK') defaultTotal = 30;
        if (lt.code === 'PERSONAL') defaultTotal = 3;

        await this.prisma.leaveBalance.upsert({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: targetEmployeeId,
              leaveTypeId: lt.id,
              year,
            },
          },
          update: {},
          create: {
            employeeId: targetEmployeeId,
            leaveTypeId: lt.id,
            year,
            totalDays: defaultTotal,
            usedDays: 0,
            pendingDays: 0,
          },
        });
      }

      dbBalances = await this.prisma.leaveBalance.findMany({
        where: {
          employeeId: targetEmployeeId,
          year,
        },
        include: {
          leaveType: true,
        },
        orderBy: {
          leaveType: { code: 'asc' },
        },
      });
    }

    const balances = dbBalances.map((b) => ({
      id: b.id,
      leaveTypeId: b.leaveTypeId,
      leaveTypeCode: b.leaveType.code,
      leaveType: b.leaveType.code,
      leaveTypeName: b.leaveType.name,
      year: b.year,
      totalDays: b.totalDays,
      usedDays: b.usedDays,
      pendingDays: b.pendingDays,
      availableDays: Math.max(0, b.totalDays - b.usedDays - b.pendingDays),
    }));

    return {
      employeeId: targetEmployeeId,
      employeeName: employee.fullName,
      year,
      balances,
    };
  }

  async getLeaveTypes() {
    return this.prisma.leaveType.findMany({
      orderBy: { code: 'asc' },
    });
  }

  async adjustBalance(
    caller: { id: string; role: string },
    data: {
      employeeId: string;
      leaveTypeId: string;
      year?: number;
      totalDays?: number;
      usedDays?: number;
      pendingDays?: number;
    },
  ) {
    if (caller.role !== 'HR' && caller.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Chỉ có bộ phận Nhân sự (HR) hoặc Quản trị viên mới được điều chỉnh quỹ phép',
      );
    }

    const year = data.year || 2026;

    const balance = await this.prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: data.employeeId,
          leaveTypeId: data.leaveTypeId,
          year,
        },
      },
      update: {
        ...(data.totalDays !== undefined && { totalDays: data.totalDays }),
        ...(data.usedDays !== undefined && { usedDays: data.usedDays }),
        ...(data.pendingDays !== undefined && { pendingDays: data.pendingDays }),
      },
      create: {
        employeeId: data.employeeId,
        leaveTypeId: data.leaveTypeId,
        year,
        totalDays: data.totalDays ?? 12,
        usedDays: data.usedDays ?? 0,
        pendingDays: data.pendingDays ?? 0,
      },
      include: {
        leaveType: true,
      },
    });

    return {
      id: balance.id,
      leaveTypeId: balance.leaveTypeId,
      leaveTypeCode: balance.leaveType.code,
      leaveTypeName: balance.leaveType.name,
      year: balance.year,
      totalDays: balance.totalDays,
      usedDays: balance.usedDays,
      pendingDays: balance.pendingDays,
      availableDays: Math.max(
        0,
        balance.totalDays - balance.usedDays - balance.pendingDays,
      ),
    };
  }
}
